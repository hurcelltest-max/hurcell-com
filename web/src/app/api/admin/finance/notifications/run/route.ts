import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';
import { sendFinanceSms } from '@/lib/sms/transactional';
import { z } from 'zod';

const runNotificationsSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  type: z.enum(['due_soon', 'overdue']),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const parseResult = runNotificationsSchema.safeParse(body);
    if (!parseResult.success) {
      const response = NextResponse.json({ error: 'Geçersiz parametreler.', details: parseResult.error.issues[0]?.message }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const { dryRun, type, asOfDate } = parseResult.data;

    // Fetch installments matching status and date
    let query = financeAdminClient
      .from('finance_installments')
      .select('*, finance_plans(*, credit_customers(*))')
      .in('status', ['pending', 'partial', 'overdue']);

    if (type === 'due_soon') {
      query = query.eq('due_date', asOfDate);
    } else {
      query = query.lt('due_date', asOfDate);
    }

    const { data: installments, error } = await query;

    if (error) {
      console.error('[FINANCE NOTIFICATIONS RUN FETCH ERROR]', error);
      const response = NextResponse.json({ error: 'Veritabanından taksitler alınamadı.' }, { status: 500 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const notifications: Array<{
      customerName: string;
      phone: string;
      message: string;
      amount: number;
      dueDate: string;
      planId: string;
      status: string;
    }> = [];

    for (const inst of (installments || [])) {
      const plan = (inst.finance_plans as unknown) as {
        id: string;
        source_reference: string;
        credit_customers?: {
          full_name?: string;
          phone?: string;
        };
      } | null;
      if (!plan || !plan.credit_customers || !plan.credit_customers.phone) continue;
      const customer = plan.credit_customers;

      const amount = Number(inst.remaining_amount) || 0;
      const dueDate = inst.due_date;
      const planId = plan.id;
      const customerName = customer.full_name || 'Bilinmeyen Müşteri';
      const rawPhone = customer.phone;

      // Construct message body
      let message = '';
      const eventType = type === 'due_soon' ? 'finance_installment_due_soon' : 'finance_installment_overdue';

      if (type === 'due_soon') {
        message = `${dueDate} vadeli ${amount.toFixed(2)} TL tutarindaki taksit odemeniz yaklasmaktadir. HurCELL`;
      } else {
        message = `Odenmemis ${amount.toFixed(2)} TL tutarindaki taksit borcunuz gecikmistir. Lutfen odeme yapiniz. HurCELL`;
      }

      // Mask phone for dryRun/logs
      const maskedPhone = rawPhone.replace(/(?<=\+?\d{4})\d+(?=\d{2})/, (m: string) => '*'.repeat(m.length));

      if (!dryRun) {
        // Trigger SMS sending
        await sendFinanceSms(planId, eventType, rawPhone, {
          amount: amount.toFixed(2),
          due_date: dueDate
        });
      }

      notifications.push({
        customerName,
        phone: maskedPhone,
        message,
        amount,
        dueDate,
        planId,
        status: dryRun ? 'simulated' : 'triggered'
      });
    }

    const response = NextResponse.json({
      success: true,
      dryRun,
      type,
      asOfDate,
      processedCount: notifications.length,
      notifications
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE NOTIFICATIONS RUN EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
