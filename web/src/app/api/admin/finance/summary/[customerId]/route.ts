import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';
import { handleFinanceApiError } from '@/lib/finance/error-handler';

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { customerId } = await context.params;

    // Fetch active/all plans for this customer
    const { data: plans, error: planErr } = await financeAdminClient
      .from('finance_plans')
      .select('*')
      .eq('credit_customer_id', customerId)
      .order('created_at', { ascending: false });

    if (planErr) {
      console.error('[CUSTOMER FINANCE SUMMARY ERROR]', planErr);
      return handleFinanceApiError(planErr, 'Cari finansal özet alınamadı.');
    }

    const planIds = (plans || []).map((p: { id: string }) => p.id);

    let installments: Array<Record<string, unknown>> = [];
    let collections: Array<Record<string, unknown>> = [];

    if (planIds.length > 0) {
      // Fetch installments
      const { data: instData } = await financeAdminClient
        .from('finance_installments')
        .select('*, finance_plans(source_reference)')
        .in('finance_plan_id', planIds)
        .order('due_date', { ascending: true });
      installments = instData || [];

      // Fetch collections
      const { data: colData } = await financeAdminClient
        .from('finance_collections')
        .select('*, finance_plans(source_reference)')
        .in('finance_plan_id', planIds)
        .order('created_at', { ascending: false });
      collections = colData || [];
    }

    const response = NextResponse.json({
      success: true,
      plans: plans || [],
      installments,
      collections
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[CUSTOMER FINANCE SUMMARY EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
