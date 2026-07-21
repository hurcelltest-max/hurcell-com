import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';
import { z } from 'zod';
import { sendFinanceSms } from '@/lib/sms/transactional';
import { handleFinanceApiError } from '@/lib/finance/error-handler';
import { getFinanceTermRatePercent, FINANCE_TARIFF_VERSION, FINANCE_MONTHLY_RATE_PERCENT } from '@/lib/finance/tariff';

const createPlanSchema = z.object({
  customerId: z.string().uuid(),
  sourceType: z.enum(['store_sale', 'web_order', 'service_order', 'manual']),
  sourceReference: z.string().trim().min(1),
  principalAmount: z.number().min(750),
  downPaymentAmount: z.number().nonnegative(),
  installmentCount: z.number().int().min(1).max(3),
  statementDay: z.number().int().refine((val) => [10, 15, 20, 25].includes(val), {
    message: 'Statement day must be 10, 15, 20, or 25',
  }),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().trim().min(1),
  downPaymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']).optional().default('cash'),
});

// 1. GET: List Plans
export async function GET(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const customerId = searchParams.get('customerId') || '';

    let query = financeAdminClient
      .from('finance_plans')
      .select('*, credit_customers(full_name, phone)');

    if (status) {
      query = query.eq('status', status);
    }
    if (customerId) {
      query = query.eq('credit_customer_id', customerId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[FINANCE PLAN LIST ERROR]', error);
      return handleFinanceApiError(error, 'Plan listesi getirilemedi.');
    }

    const response = NextResponse.json({ success: true, plans: data });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE PLAN LIST EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

// 2. POST: Create Finance Plan
export async function POST(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();

    if (
      body !== null &&
      typeof body === 'object' &&
      Object.prototype.hasOwnProperty.call(body, 'termRatePercent')
    ) {
      const response = NextResponse.json(
        { error: 'İstek parametreleri geçersizdir.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const parseResult = createPlanSchema.safeParse(body);
    if (!parseResult.success) {
      const response = NextResponse.json({ error: 'Geçersiz parametreler.', details: parseResult.error.issues[0]?.message }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const val = parseResult.data;
    if (val.downPaymentAmount > val.principalAmount) {
      const response = NextResponse.json({ error: 'Peşinat ana tutardan büyük olamaz.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const termRatePercent = getFinanceTermRatePercent(val.installmentCount);

    // Call create_finance_plan RPC
    const rpcArgs = {
      p_idempotency_key: val.idempotencyKey,
      p_customer_id: val.customerId,
      p_source_type: val.sourceType,
      p_source_reference: val.sourceReference,
      p_principal_amount: val.principalAmount,
      p_down_payment_amount: val.downPaymentAmount,
      p_term_rate_percent: termRatePercent,
      p_installment_count: val.installmentCount,
      p_statement_day: val.statementDay,
      p_first_due_date: val.firstDueDate,
      p_created_by: auth.username,
      p_down_payment_method: val.downPaymentMethod,
    };
    const { data, error } = await financeAdminClient.rpc('create_finance_plan', rpcArgs);

    if (error) {
      console.error('[FINANCE PLAN CREATE RPC ERROR]', error);
      return handleFinanceApiError(error, 'Plan oluşturulamadı.');
    }

    const resultData = data as {
      plan?: {
        id: string;
        total_due_amount: number;
        installment_count: number;
        first_due_date: string;
      };
    };
    const plan = resultData?.plan;

    if (plan && plan.id) {
      // Fetch customer phone to send SMS
      try {
        const { data: customer } = await financeAdminClient
          .from('credit_customers')
          .select('phone')
          .eq('id', val.customerId)
          .single();

        if (customer && customer.phone) {
          await sendFinanceSms({
            planId: plan.id,
            event: 'finance_plan_created',
            eventInstanceKey: 'plan',
            rawPhone: customer.phone,
            data: {
              amount: Number(plan.total_due_amount).toFixed(2),
              installment_count: plan.installment_count,
              due_date: plan.first_due_date
            }
          });
        }
      } catch (smsErr) {
        console.error('[FINANCE PLAN SMS TRIGGER ERROR]', smsErr);
      }
    }

    const response = NextResponse.json({
      success: true,
      result: data,
      tariff: {
        version: FINANCE_TARIFF_VERSION,
        monthlyRatePercent: FINANCE_MONTHLY_RATE_PERCENT,
        termRatePercent
      }
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE PLAN CREATE EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
