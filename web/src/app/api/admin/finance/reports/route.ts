import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';

export async function GET(req: Request) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const status = searchParams.get('status');
    const sourceType = searchParams.get('sourceType');
    const customerId = searchParams.get('customerId');
    const overdueOnly = searchParams.get('overdueOnly') === 'true';

    // Build query for plans
    let plansQuery = financeAdminClient
      .from('finance_plans')
      .select('*, credit_customers(full_name, phone)');

    if (from) plansQuery = plansQuery.gte('created_at', from);
    if (to) plansQuery = plansQuery.lte('created_at', to);
    if (status) plansQuery = plansQuery.eq('status', status);
    if (sourceType) plansQuery = plansQuery.eq('source_type', sourceType);
    if (customerId) plansQuery = plansQuery.eq('credit_customer_id', customerId);
    if (overdueOnly) plansQuery = plansQuery.eq('status', 'overdue');

    const { data: plans, error: plansError } = await plansQuery.order('created_at', { ascending: false });

    if (plansError) {
      console.error('[FINANCE REPORTS PLANS ERROR]', plansError);
      const response = NextResponse.json({ error: 'Planlar yüklenemedi.' }, { status: 500 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // Aggregations
    let totalFinanced = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalInterestCharge = 0;
    
    let activeCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let cancelledCount = 0;

    const sourceBreakdown = {
      store_sale: 0,
      web_order: 0,
      service_order: 0,
      manual: 0,
    };

    plans?.forEach((p) => {
      totalFinanced += Number(p.principal_amount) || 0;
      totalCollected += Number(p.amount_paid) || 0;
      totalOutstanding += Number(p.remaining_amount) || 0;
      totalInterestCharge += Number(p.finance_charge_amount) || 0;

      if (p.status === 'active') activeCount++;
      else if (p.status === 'paid') paidCount++;
      else if (p.status === 'overdue') overdueCount++;
      else if (p.status === 'cancelled') cancelledCount++;

      const st = p.source_type as keyof typeof sourceBreakdown;
      if (sourceBreakdown[st] !== undefined) {
        sourceBreakdown[st] += Number(p.principal_amount) || 0;
      }
    });

    // Check installments for due dates (today and next 7 days)
    const todayStr = new Date().toISOString().slice(0, 10);
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = next7Days.toISOString().slice(0, 10);

    const { data: installments } = await financeAdminClient
      .from('finance_installments')
      .select('remaining_amount, due_date, status')
      .in('status', ['pending', 'partial', 'overdue']);

    let dueToday = 0;
    let dueNext7Days = 0;

    installments?.forEach((inst) => {
      const remaining = Number(inst.remaining_amount) || 0;
      if (inst.due_date === todayStr) {
        dueToday += remaining;
      }
      if (inst.due_date >= todayStr && inst.due_date <= next7DaysStr) {
        dueNext7Days += remaining;
      }
    });

    // Get count of overdue customers
    const { data: overdueCusts } = await financeAdminClient
      .from('finance_plans')
      .select('credit_customer_id')
      .eq('status', 'overdue');
    
    const uniqueOverdueCusts = new Set(overdueCusts?.map(oc => oc.credit_customer_id) || []);

    const response = NextResponse.json({
      success: true,
      metrics: {
        activeCount,
        paidCount,
        overdueCount,
        cancelledCount,
        totalFinanced,
        totalCollected,
        totalOutstanding,
        totalInterestCharge,
        dueToday,
        dueNext7Days,
        overdueCustomersCount: uniqueOverdueCusts.size
      },
      sourceBreakdown,
      plans
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE REPORTS EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
