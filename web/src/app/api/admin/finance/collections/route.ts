import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';
import { z } from 'zod';
import { sendFinanceSms } from '@/lib/sms/transactional';
import { handleFinanceApiError } from '@/lib/finance/error-handler';

const recordCollectionSchema = z.object({
  planId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']),
  collectionKind: z.enum(['down_payment', 'installment_payment', 'early_closure', 'adjustment']),
  idempotencyKey: z.string().min(1),
  note: z.string().optional().default(''),
});

export async function POST(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const parseResult = recordCollectionSchema.safeParse(body);
    if (!parseResult.success) {
      const response = NextResponse.json({ error: 'Geçersiz parametreler.', details: parseResult.error.issues[0]?.message }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const val = parseResult.data;

    // Call record_finance_collection RPC
    const rpcArgs = {
      p_idempotency_key: val.idempotencyKey,
      p_plan_id: val.planId,
      p_amount: val.amount,
      p_payment_method: val.paymentMethod,
      p_collection_kind: val.collectionKind,
      p_collected_at: new Date().toISOString(),
      p_created_by: auth.username,
      p_note: val.note
    };
    const { data, error } = await financeAdminClient.rpc('record_finance_collection', rpcArgs);

    if (error) {
      console.error('[FINANCE COLLECTION CREATE RPC ERROR]', error);
      return handleFinanceApiError(error, 'Tahsilat kaydı oluşturulamadı.');
    }

    const resultData = data as {
      plan?: {
        id: string;
        credit_customer_id: string;
        remaining_amount: number;
      };
      collection?: {
        amount: number;
      };
    };
    const plan = resultData?.plan;
    const col = resultData?.collection;

    if (plan && plan.id && col) {
      try {
        const { data: customer } = await financeAdminClient
          .from('credit_customers')
          .select('phone')
          .eq('id', plan.credit_customer_id)
          .single();

        if (customer && customer.phone) {
          // Send payment received SMS
          await sendFinanceSms(plan.id, 'finance_payment_received', customer.phone, {
            amount: Number(col.amount).toFixed(2),
            remaining_balance: Number(plan.remaining_amount).toFixed(2)
          });

          // Send balance remaining SMS if plan is paid or has balance
          await sendFinanceSms(plan.id, 'finance_balance_remaining', customer.phone, {
            remaining_balance: Number(plan.remaining_amount).toFixed(2)
          });
        }
      } catch (smsErr) {
        console.error('[FINANCE COLLECTION SMS TRIGGER ERROR]', smsErr);
      }
    }

    const response = NextResponse.json({ success: true, result: data });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE COLLECTION CREATE EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
