import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

    const { data: plans, error } = await plansQuery.order('created_at', { ascending: false });

    if (error) {
      console.error('[FINANCE REPORTS CSV ERROR]', error);
      const response = NextResponse.json({ error: 'Rapor verileri alınamadı.' }, { status: 500 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    // CSV Headers
    const headers = [
      'Müşteri Adı',
      'Telefon',
      'Kaynak Türü',
      'Kaynak Referansı',
      'Ana Tutar',
      'Peşinat',
      'Finanse Edilen',
      'Vade Farkı Oranı (%)',
      'Vade Farkı Tutarı',
      'Toplam Borç',
      'Ödenen',
      'Kalan Borç',
      'Taksit Sayısı',
      'Durum',
      'İlk Vade Tarihi',
      'Oluşturulma Tarihi'
    ];

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += headers.map(escapeCsvField).join(',') + '\r\n';

    plans?.forEach((p) => {
      const customer = (p.credit_customers as unknown) as { full_name?: string; phone?: string } | null || {};
      const row = [
        customer.full_name || '',
        customer.phone || '',
        p.source_type,
        p.source_reference,
        p.principal_amount,
        p.down_payment_amount,
        p.financed_principal,
        p.term_rate_percent,
        p.finance_charge_amount,
        p.total_due_amount,
        p.amount_paid,
        p.remaining_amount,
        p.installment_count,
        p.status,
        p.first_due_date,
        p.created_at
      ];
      csvContent += row.map(escapeCsvField).join(',') + '\r\n';
    });

    const response = new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="finance_reports.csv"',
        'Cache-Control': 'no-store'
      }
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE REPORTS CSV EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
