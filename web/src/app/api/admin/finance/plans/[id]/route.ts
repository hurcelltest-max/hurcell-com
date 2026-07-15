import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await context.params;

    // Fetch plan details
    const { data: plan, error: planError } = await financeAdminClient
      .from('finance_plans')
      .select('*, credit_customers(*), credit_accounts(*)')
      .eq('id', id)
      .single();

    if (planError || !plan) {
      console.error('[FINANCE PLAN DETAIL ERROR]', planError);
      const response = NextResponse.json({ error: 'Plan bulunamadı.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Fetch installments
    const { data: installments } = await financeAdminClient
      .from('finance_installments')
      .select('*')
      .eq('finance_plan_id', id)
      .order('installment_no', { ascending: true });

    // Fetch collections
    const { data: collections } = await financeAdminClient
      .from('finance_collections')
      .select('*')
      .eq('finance_plan_id', id)
      .order('created_at', { ascending: false });

    // Fetch audit logs
    const { data: auditLogs } = await financeAdminClient
      .from('finance_audit_logs')
      .select('*')
      .eq('finance_plan_id', id)
      .order('created_at', { ascending: false });

    const response = NextResponse.json({
      success: true,
      plan,
      installments: installments || [],
      collections: collections || [],
      auditLogs: auditLogs || []
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE PLAN DETAIL EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
