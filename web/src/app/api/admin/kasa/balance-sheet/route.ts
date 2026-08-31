import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Bilanço ve kâr-zarar raporu yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const todayStr = new Date().toISOString().split('T')[0];
    const monthIso = todayStr.substring(0, 7); // '2026-08'
    const startOfMonth = `${monthIso}-01T00:00:00.000Z`;
    const endOfMonth = `${todayStr}T23:59:59.999Z`;

    // 1. Son Açık/Kapalı Günün Fiziki Kasası
    const { data: latestDay } = await supabase
      .from('kasa_days')
      .select('*')
      .order('date_val', { ascending: false })
      .limit(1)
      .single();

    const physicalCashTL = (latestDay?.expected_cash_kurus || 0) / 100;
    const usdCashCents = latestDay?.usd_balance_cents || 0;
    const eurCashCents = latestDay?.eur_balance_cents || 0;

    // 2. Banka Bakiyeleri (Sadece Aktif Hareketler)
    const { data: bankAccounts } = await supabase.from('kasa_bank_accounts').select('id, currency_code');
    let bankBalancesTRY = 0;

    for (const acc of bankAccounts || []) {
      const { data: bData } = await supabase.rpc('fn_kasa_get_bank_account_balance', { p_account_id: acc.id });
      const bMinor = Number(bData || 0);
      if (acc.currency_code === 'TRY') {
        bankBalancesTRY += bMinor / 100;
      }
    }

    // 3. POS Bekleyen Alacak
    const { data: posSales } = await supabase
      .from('kasa_sales')
      .select('card_paid_kurus')
      .eq('status', 'completed');
    const totalPosSalesKurus = (posSales || []).reduce((acc, s) => acc + Number(s.card_paid_kurus || 0), 0);

    const { data: posSettlements } = await supabase
      .from('kasa_bank_transactions')
      .select('amount_minor')
      .eq('transaction_type', 'pos_settlement')
      .eq('status', 'active');
    const totalPosSettledMinor = (posSettlements || []).reduce((acc, t) => acc + Number(t.amount_minor || 0), 0);

    const pendingPosReceivablesTRY = Math.max(0, (totalPosSalesKurus - totalPosSettledMinor) / 100);

    // 4. Açık Cari Alacak
    const { data: openCreditSales } = await supabase
      .from('kasa_sales')
      .select('uncollected_credit_kurus')
      .eq('status', 'completed')
      .gt('uncollected_credit_kurus', 0);
    const openCreditReceivablesTRY = (openCreditSales || []).reduce((acc, s) => acc + Number(s.uncollected_credit_kurus || 0), 0) / 100;

    // 5. Yükümlülükler (Ödenmemiş TS Maliyeti)
    const { data: unpaidTsSales } = await supabase
      .from('kasa_sales')
      .select('service_cost_kurus')
      .eq('status', 'completed')
      .eq('service_cost_payment_status', 'unpaid')
      .gt('service_cost_kurus', 0);
    const unpaidTsCostsTRY = (unpaidTsSales || []).reduce((acc, s) => acc + Number(s.service_cost_kurus || 0), 0) / 100;

    const totalLiquidAssetsTRY = physicalCashTL + bankBalancesTRY;
    const totalFinancialAssetsTRY = totalLiquidAssetsTRY + pendingPosReceivablesTRY + openCreditReceivablesTRY;
    const totalLiabilitiesTRY = unpaidTsCostsTRY;
    const netFinancialAssetsTRY = totalFinancialAssetsTRY - totalLiabilitiesTRY;

    // 6. Dönem Kâr/Zarar (Aybaşından Bugüne)
    const { data: monthSales } = await supabase
      .from('kasa_sales')
      .select('total_price_kurus, cost_price_kurus, service_cost_kurus, status')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth)
      .eq('status', 'completed');

    const grossTurnoverTL = (monthSales || []).reduce((acc, s) => acc + Number(s.total_price_kurus || 0), 0) / 100;
    const productSalesCostTL = (monthSales || []).reduce((acc, s) => acc + Number(s.cost_price_kurus || 0), 0) / 100;
    const tsDirectCostTL = (monthSales || []).reduce((acc, s) => acc + Number(s.service_cost_kurus || 0), 0) / 100;

    const grossProfitTL = grossTurnoverTL - productSalesCostTL - tsDirectCostTL;

    // Giderler (kasa_expenses nakit giderleri + banka işletme giderleri)
    const { data: monthCashExpenses } = await supabase
      .from('kasa_expenses')
      .select('amount_kurus, expense_category:kasa_expense_categories(is_salary_category)')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth)
      .eq('status', 'active')
      .eq('payment_source', 'cash');

    let generalOperatingExpensesTL = 0;
    let salaryExpensesTL = 0;

    (monthCashExpenses || []).forEach((e: any) => {
      const amt = Number(e.amount_kurus || 0) / 100;
      if (e.expense_category?.is_salary_category) {
        salaryExpensesTL += amt;
      } else {
        generalOperatingExpensesTL += amt;
      }
    });

    const { data: monthBankExpenses } = await supabase
      .from('kasa_bank_transactions')
      .select('amount_minor')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth)
      .eq('status', 'active')
      .eq('is_operating_expense', true);

    const bankOperatingExpensesTL = (monthBankExpenses || []).reduce((acc, t) => acc + Number(t.amount_minor || 0), 0) / 100;

    const totalExpensesTL = generalOperatingExpensesTL + bankOperatingExpensesTL + salaryExpensesTL;
    const netProfitTL = grossProfitTL - totalExpensesTL;

    const report = {
      as_of_date: todayStr,
      financial_status: {
        physical_cash_tl: physicalCashTL,
        usd_cash_cents: usdCashCents,
        eur_cash_cents: eurCashCents,
        bank_balances_try: bankBalancesTRY,
        pending_pos_receivables_try: pendingPosReceivablesTRY,
        open_credit_receivables_try: openCreditReceivablesTRY,
        total_liquid_assets_try: totalLiquidAssetsTRY,
        total_financial_assets_try: totalFinancialAssetsTRY,
        unpaid_ts_costs_try: unpaidTsCostsTRY,
        total_liabilities_try: totalLiabilitiesTRY,
        net_financial_assets_try: netFinancialAssetsTRY,
        liabilities_status_note: 'Ödenmemiş teknik servis maliyetleri borç olarak düşülmüştür.',
      },
      income_statement: {
        month_label: 'Ağustos 2026',
        gross_turnover_tl: grossTurnoverTL,
        product_sales_cost_tl: productSalesCostTL,
        ts_direct_cost_tl: tsDirectCostTL,
        gross_profit_tl: grossProfitTL,
        general_operating_expenses_tl: generalOperatingExpensesTL,
        bank_operating_expenses_tl: bankOperatingExpensesTL,
        salary_expenses_tl: salaryExpensesTL,
        realized_fx_diff_tl: 0,
        net_profit_tl: netProfitTL,
        missing_cost_sales_count: 0,
        missing_cost_warning: false,
      },
      reconciliation_table: [
        { channel: 'Nakit', gross_collection_tl: physicalCashTL, refunds_tl: 0, net_collection_tl: physicalCashTL, reflected_destination: 'Fiziki Nakit Kasa' },
        { channel: 'POS / Kredi Kartı', gross_collection_tl: totalPosSalesKurus / 100, refunds_tl: 0, net_collection_tl: totalPosSalesKurus / 100, reflected_destination: 'POS Bekleyen / Banka' },
        { channel: 'Banka Havalesi', gross_collection_tl: 0, refunds_tl: 0, net_collection_tl: 0, reflected_destination: 'Banka Hesabı' },
      ]
    };

    return NextResponse.json({ report });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Bilanço raporu alınamadı.' }, { status: 500 });
  }
}
