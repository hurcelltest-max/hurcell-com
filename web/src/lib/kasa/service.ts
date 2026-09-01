import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from './crypto';
import { calculateOverdueDays, calculatePrudentResult } from './math';
import { getTCMBExchangeRates } from './tcmb';
import {
  isSaleCostMissing,
  evaluateOpenDaysChain,
  OpenDaysChainResult,
} from './pure_utils';
export { isSaleCostMissing, evaluateOpenDaysChain, type OpenDaysChainResult };
import {
  DashboardCarryoverInfo,
  KasaBankDeposit,
  KasaCategory,
  KasaCategorySummary,
  KasaCreditCustomer,
  KasaCreditPayment,
  KasaDashboardMetrics,
  KasaDay,
  KasaExpense,
  KasaExpenseCategory,
  KasaExpenseCategorySummary,
  KasaFXTransaction,
  KasaMonthlyReport,
  KasaSale,
  KasaSettings,
  KasaUnifiedMovement,
  KasaUser,
  KasaUserRole,
  TechnicalServiceDetails,
} from './types';

export interface KasaPeriodReportMetrics {
  period_name: string;
  start_date: string;
  end_date: string;
  opening_balance_kurus: number;
  closing_balance_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  gross_sales_kurus: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  bank_transfer_collection_kurus: number;
  credit_sales_total_kurus: number;
  credit_collections_total_kurus: number;
  returns_total_kurus: number;
  total_expenses_kurus: number;
  salary_expenses_kurus: number;
  technical_service_revenue_kurus: number;
  technical_service_expense_kurus: number;
  total_product_cost_kurus: number;
  realized_net_profit_kurus: number;
  uncollected_credit_risk_kurus: number;
  prudent_financial_result_kurus: number;
  missing_cost_sales_count: number;
  missing_cost_warning: boolean;
  bank_deposits_total_kurus: number;
  usd_sales_count: number;
  usd_total_cents: number;
  eur_sales_count: number;
  eur_total_cents: number;
  realized_fx_diff_total_kurus: number;
  open_credit_total_kurus: number;
  overdue_credit_total_kurus: number;
  category_summaries: KasaCategorySummary[];
  expense_summaries: Array<{ category_id: string; category_name: string; amount_kurus: number }>;
}

export async function getUserByUsername(username: string): Promise<(KasaUser & { password_hash: string }) | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_users')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getUserById(id: string): Promise<KasaUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_users')
    .select('id, username, full_name, role, is_active, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as KasaUser;
}

export async function hasAnyManagerUser(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('kasa_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'yonetici')
    .eq('is_active', true);

  if (error) return false;
  return Boolean(count && count > 0);
}

export async function listKasaUsers(): Promise<KasaUser[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_users')
    .select('id, username, full_name, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as KasaUser[];
}

export async function createKasaUser(input: {
  username: string;
  full_name: string;
  password_raw: string;
  role: KasaUserRole;
}): Promise<KasaUser> {
  const supabase = getSupabaseAdmin();
  const password_hash = hashPassword(input.password_raw);
  const cleanUsername = input.username.trim().toLowerCase();

  const { data, error } = await supabase
    .from('kasa_users')
    .insert({
      username: cleanUsername,
      full_name: input.full_name.trim(),
      password_hash,
      role: input.role,
      is_active: true,
    })
    .select('id, username, full_name, role, is_active, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.');
    }
    throw new Error(`Kullanıcı oluşturulamadı: ${error.message}`);
  }

  return data as KasaUser;
}

export async function updateKasaUser(
  id: string,
  updates: { full_name?: string; is_active?: boolean; role?: KasaUserRole; password_raw?: string }
): Promise<KasaUser> {
  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.full_name !== undefined) payload.full_name = updates.full_name.trim();
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.password_raw) payload.password_hash = hashPassword(updates.password_raw);

  const { data, error } = await supabase
    .from('kasa_users')
    .update(payload)
    .eq('id', id)
    .select('id, username, full_name, role, is_active, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`Kullanıcı güncellenemedi: ${error?.message}`);
  }

  return data as KasaUser;
}

export async function getKasaSettings(): Promise<KasaSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('kasa_settings').select('*').limit(1).maybeSingle();

  if (error || !data) {
    return {
      id: 'default',
      cash_reserve_target_kurus: 1500000,
      updated_at: new Date().toISOString(),
    };
  }

  return data as KasaSettings;
}

export async function updateTargetReserve(actorUserId: string, targetKurus: number): Promise<KasaSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_update_target_reserve', {
    p_actor_user_id: actorUserId,
    p_target_kurus: targetKurus,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Hedef kasa bakiyesi güncellenemedi.');
  }

  return data as KasaSettings;
}

export async function getKasaCategories(): Promise<KasaCategory[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error || !data) return [];
  return data as KasaCategory[];
}


export async function getSaleById(saleId: string): Promise<KasaSale | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_sales')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();

  if (error || !data) return null;
  return data as KasaSale;
}

export async function getKasaCategoryById(id: string): Promise<KasaCategory | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as KasaCategory;
}

export async function getKasaExpenseCategories(): Promise<KasaExpenseCategory[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error || !data) return [];
  return data as KasaExpenseCategory[];
}



export async function getOpenDaysChain(actorUserId: string): Promise<OpenDaysChainResult> {
  const supabase = getSupabaseAdmin();

  const { data: openDaysRaw } = await supabase
    .from('kasa_days')
    .select('*')
    .eq('status', 'open')
    .order('date_val', { ascending: true });

  const openDays = (openDaysRaw || []) as KasaDay[];
  const todayIso = new Date().toISOString().split('T')[0];

  return evaluateOpenDaysChain(openDays, todayIso);
}

export async function getOrCreateTodayDay(actorUserId: string): Promise<KasaDay & { is_previous_day_unclosed?: boolean; unclosed_day_date?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_get_or_create_open_day', {
    p_actor_user_id: actorUserId,
  });

  if (error || !data) {
    // Önceki gün kapatılmamışsa, aktif açık günü güvenli biçimde getir
    if (error?.message?.includes('PREVIOUS_DAY_UNCLOSED') || error?.message?.includes('kapatılmamış')) {
      const { data: openDays } = await supabase
        .from('kasa_days')
        .select('*')
        .eq('status', 'open')
        .order('date_val', { ascending: false })
        .limit(1);

      if (openDays && openDays.length > 0) {
        return {
          ...(openDays[0] as KasaDay),
          is_previous_day_unclosed: true,
          unclosed_day_date: openDays[0].date_val,
        };
      }
    }
    throw new Error(`Kasa günü alınamadı: ${error?.message || 'Bilinmeyen veritabanı hatası'}`);
  }

  return data as KasaDay;
}

export async function searchCreditCustomers(query: string): Promise<KasaCreditCustomer[]> {
  const supabase = getSupabaseAdmin();
  const cleanQ = query.trim().toLowerCase();

  const { data: customers, error } = await supabase
    .from('credit_customers')
    .select(`
      id, full_name, phone, phone_normalized, tc_identity_number, status,
      credit_accounts (
        id, credit_limit, current_balance, status
      )
    `)
    .eq('status', 'active');

  if (error || !customers) return [];

  const results: KasaCreditCustomer[] = [];

  for (const c of customers) {
    const acc = Array.isArray(c.credit_accounts) && c.credit_accounts.length > 0 ? c.credit_accounts[0] : null;
    const limit = Number(acc?.credit_limit || 0);
    const balance = Number(acc?.current_balance || 0);
    const available = Math.max(limit - balance, 0);
    const isApproved = Boolean(acc && acc.status === 'active' && limit > 0);

    const matchesName = c.full_name.toLowerCase().includes(cleanQ);
    const matchesPhone = c.phone.includes(cleanQ) || c.phone_normalized.includes(cleanQ);

    if (cleanQ === '' || matchesName || matchesPhone) {
      results.push({
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        phone_normalized: c.phone_normalized,
        tc_identity_number: c.tc_identity_number || undefined,
        status: c.status as any,
        credit_account_id: acc?.id,
        credit_limit_tl: limit,
        current_balance_tl: balance,
        available_limit_tl: available,
        is_approved: isApproved,
      });
    }
  }

  return results;
}

export async function listCreditCustomersWithStatus(): Promise<KasaCreditCustomer[]> {
  const supabase = getSupabaseAdmin();

  const { data: customers } = await supabase
    .from('credit_customers')
    .select(`
      id, full_name, phone, phone_normalized, tc_identity_number, status,
      credit_accounts (
        id, credit_limit, current_balance, status
      )
    `)
    .order('full_name', { ascending: true });

  const { data: openSales } = await supabase
    .from('kasa_sales')
    .select('credit_customer_id, uncollected_credit_kurus, created_at')
    .eq('status', 'completed')
    .gt('uncollected_credit_kurus', 0);

  const salesMap = new Map<string, { count: number; oldestDate: string; maxOverdueDays: number; isOverdue: boolean }>();

  for (const s of openSales || []) {
    if (!s.credit_customer_id) continue;
    const existing = salesMap.get(s.credit_customer_id) || { count: 0, oldestDate: s.created_at, maxOverdueDays: 0, isOverdue: false };
    const overdueCalc = calculateOverdueDays(s.created_at, 7);

    const oldestDate = s.created_at < existing.oldestDate ? s.created_at : existing.oldestDate;
    const maxOverdueDays = Math.max(overdueCalc.ageDays, existing.maxOverdueDays);
    const isOverdue = existing.isOverdue || overdueCalc.isOverdue;

    salesMap.set(s.credit_customer_id, {
      count: existing.count + 1,
      oldestDate,
      maxOverdueDays,
      isOverdue,
    });
  }

  const results: KasaCreditCustomer[] = [];

  for (const c of customers || []) {
    const acc = Array.isArray(c.credit_accounts) && c.credit_accounts.length > 0 ? c.credit_accounts[0] : null;
    const limit = Number(acc?.credit_limit || 0);
    const balance = Number(acc?.current_balance || 0);
    const available = Math.max(limit - balance, 0);
    const isApproved = Boolean(acc && acc.status === 'active' && limit > 0);
    const stat = salesMap.get(c.id);

    results.push({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      phone_normalized: c.phone_normalized,
      tc_identity_number: c.tc_identity_number || undefined,
      status: c.status as any,
      credit_account_id: acc?.id,
      credit_limit_tl: limit,
      current_balance_tl: balance,
      available_limit_tl: available,
      is_approved: isApproved,
      open_sales_count: stat?.count || 0,
      oldest_open_sale_date: stat?.oldestDate,
      max_overdue_days: stat?.maxOverdueDays || 0,
      is_overdue: stat?.isOverdue || false,
    });
  }

  // Sıralama: En fazla geciken ve en yüksek borcu olanlar üstte
  results.sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    if (a.max_overdue_days !== b.max_overdue_days) return (b.max_overdue_days || 0) - (a.max_overdue_days || 0);
    return b.current_balance_tl - a.current_balance_tl;
  });

  return results;
}

export async function getDashboardMetrics(dayId: string, actorRole?: KasaUserRole): Promise<KasaDashboardMetrics> {
  const supabase = getSupabaseAdmin();
  const settings = await getKasaSettings();
  const fxRates = await getTCMBExchangeRates();

  const { data: day } = await supabase.from('kasa_days').select('*').eq('id', dayId).single();

  const { data: sales } = await supabase
    .from('kasa_sales')
    .select(`
      id, quantity, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, total_price_kurus, cost_price_kurus, service_cost_kurus,
      credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus, created_at,
      usd_paid_cents, eur_paid_cents,
      category:kasa_categories(name)
    `)
    .eq('kasa_day_id', dayId)
    .eq('status', 'completed');

  const { data: creditPayments } = await supabase
    .from('kasa_credit_payments')
    .select('amount_kurus, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus')
    .eq('kasa_day_id', dayId);

  const { data: allOpenSales } = await supabase
    .from('kasa_sales')
    .select('credit_customer_id, uncollected_credit_kurus, uncollected_cost_kurus, created_at')
    .eq('status', 'completed')
    .gt('uncollected_credit_kurus', 0);

  const { data: expenses } = await supabase
    .from('kasa_expenses')
    .select(`
      amount_kurus, sale_id, payment_method,
      category:kasa_expense_categories(name, is_salary_category)
    `)
    .eq('kasa_day_id', dayId)
    .neq('status', 'cancelled');

  const { data: bankDeposits } = await supabase
    .from('kasa_bank_deposits')
    .select('amount_kurus')
    .eq('kasa_day_id', dayId);

  const { data: fxConversions } = await supabase
    .from('kasa_fx_transactions')
    .select('tl_equivalent_kurus, realized_fx_diff_kurus')
    .eq('kasa_day_id', dayId)
    .eq('transaction_type', 'fx_conversion_to_try');

  const { data: returns } = await supabase
    .from('kasa_movements')
    .select('amount_kurus, cash_portion_kurus')
    .eq('kasa_day_id', dayId)
    .in('movement_type', ['iade', 'iptal']);

  let salesCount = sales?.length || 0;
  let totalQuantity = 0;
  let cashCollection = 0;
  let cardCollection = 0;
  let bankTransferCollection = 0;
  let creditSalesTotal = 0;
  let grossSales = 0;
  let totalProductCost = 0;
  let uncollectedProductCost = 0;
  let technicalServiceRevenue = 0;
  let technicalServiceExpenseFromSales = 0;
  let missingCostWarning = false;

  for (const s of sales || []) {
    totalQuantity += s.quantity;
    cashCollection += Number(s.cash_paid_kurus || 0);
    cardCollection += Number(s.card_paid_kurus || 0);
    bankTransferCollection += Number(s.bank_transfer_paid_kurus || 0);
    creditSalesTotal += Number(s.credit_paid_kurus || 0);
    grossSales += Number(s.total_price_kurus || 0);

    const categoryObj: any = Array.isArray(s.category) ? s.category[0] : s.category;
    const categoryName = categoryObj?.name;

    if (categoryName === 'Teknik Servis') {
      technicalServiceRevenue += Number(s.total_price_kurus || 0);
      if (s.service_cost_kurus !== null && s.service_cost_kurus !== undefined) {
        technicalServiceExpenseFromSales += Number(s.service_cost_kurus || 0);
      }
    } else {
      if (s.cost_price_kurus === null || s.cost_price_kurus === undefined) {
        missingCostWarning = true;
      } else {
        totalProductCost += Number(s.cost_price_kurus || 0) * s.quantity;
        uncollectedProductCost += Number(s.uncollected_cost_kurus || 0);
      }
    }
  }

  let creditCollectionsTotal = 0;
  for (const cp of creditPayments || []) {
    creditCollectionsTotal += Number(cp.amount_kurus || 0);
    cashCollection += Number(cp.cash_paid_kurus || 0);
    cardCollection += Number(cp.card_paid_kurus || 0);
    bankTransferCollection += Number(cp.bank_transfer_paid_kurus || 0);
  }

  let openCreditTotal = 0;
  let overdueCreditTotal = 0;
  const overdueCustomerSet = new Set<string>();

  for (const os of allOpenSales || []) {
    const amt = Number(os.uncollected_credit_kurus || 0);
    openCreditTotal += amt;
    const ov = calculateOverdueDays(os.created_at, 7);
    if (ov.isOverdue) {
      overdueCreditTotal += amt;
      if (os.credit_customer_id) overdueCustomerSet.add(os.credit_customer_id);
    }
  }

  let expensesTotal = 0;
  let cashExpensesTotal = 0;
  let salaryExpenses = 0;
  let technicalServiceExpenseFromExpenses = 0;

  for (const e of expenses || []) {
    const amt = Number(e.amount_kurus || 0);
    expensesTotal += amt;
    if (e.payment_method !== 'bank') cashExpensesTotal += amt;
    const expCatObj: any = Array.isArray(e.category) ? e.category[0] : e.category;
    const catName = expCatObj?.name;
    const isSalary = expCatObj?.is_salary_category;

    if (isSalary || catName === 'Personel Maaşı') {
      salaryExpenses += amt;
    } else if (catName === 'Teknik Servis Gideri' && !e.sale_id) {
      technicalServiceExpenseFromExpenses += amt;
    }
  }

  let bankDepositsTotal = 0;
  for (const b of bankDeposits || []) {
    bankDepositsTotal += Number(b.amount_kurus || 0);
  }

  let fxConversionsTRYTotal = 0;
  let realizedFxDiffTotal = 0;
  for (const fx of fxConversions || []) {
    fxConversionsTRYTotal += Number(fx.tl_equivalent_kurus || 0);
    realizedFxDiffTotal += Number(fx.realized_fx_diff_kurus || 0);
  }

  let returnsTotal = 0;
  let cashReturnsTotal = 0;
  for (const r of returns || []) {
    returnsTotal += Math.abs(Number(r.amount_kurus || 0));
    cashReturnsTotal += Math.abs(Number(r.cash_portion_kurus || 0));
  }

  const openingBalance = Number(day?.opening_balance_kurus || 0);
  const capitalInjected = Number(day?.capital_injected_kurus || 0);
  const ownerWithdrawn = Number(day?.owner_withdrawn_kurus || 0);

  const expectedCash = openingBalance + capitalInjected - ownerWithdrawn + cashCollection + fxConversionsTRYTotal - cashExpensesTotal - cashReturnsTotal - bankDepositsTotal;

  const usdBalanceCents = Number(day?.usd_balance_cents || 0);
  const eurBalanceCents = Number(day?.eur_balance_cents || 0);

  const usdTLEquivalentKurus = Math.round((usdBalanceCents / 100.0) * fxRates.usdRate * 100);
  const eurTLEquivalentKurus = Math.round((eurBalanceCents / 100.0) * fxRates.eurRate * 100);
  const totalFxTLEquivalentKurus = usdTLEquivalentKurus + eurTLEquivalentKurus;
  const totalAssetTRYEquivalentKurus = expectedCash + totalFxTLEquivalentKurus;

  const cashReserveTarget = Number(settings.cash_reserve_target_kurus || 1500000);
  const excessCashToBank = Math.max(expectedCash - cashReserveTarget, 0);
  const reserveDeficit = Math.max(cashReserveTarget - expectedCash, 0);

  const totalServiceCosts = technicalServiceExpenseFromSales + technicalServiceExpenseFromExpenses;

  // TAHSİL EDİLMİŞ GERÇEKLEŞEN KÂR (Cari satıştaki henüz tahsil edilmeyen gelir ve maliyet düşülür)
  const collectedProductCost = totalProductCost - uncollectedProductCost;
  const realizedSalesRevenue = grossSales - creditSalesTotal;
  const estimatedProfit = grossSales - returnsTotal - totalProductCost - totalServiceCosts - expensesTotal + realizedFxDiffTotal;
  const realizedNetProfit = realizedSalesRevenue - returnsTotal - collectedProductCost - totalServiceCosts - expensesTotal + realizedFxDiffTotal;

  const uncollectedCreditRisk = openCreditTotal;
  const prudentFinancialResult = calculatePrudentResult(realizedNetProfit, uncollectedCreditRisk);

  if (actorRole === 'personel') {
    salaryExpenses = 0;
  }

  return {
    sales_count: salesCount,
    total_quantity: totalQuantity,
    cash_collection_kurus: cashCollection,
    card_collection_kurus: cardCollection,
    bank_transfer_collection_kurus: bankTransferCollection,
    credit_sales_total_kurus: creditSalesTotal,
    credit_collections_total_kurus: creditCollectionsTotal,
    gross_sales_kurus: grossSales,
    expenses_total_kurus: cashExpensesTotal,
    returns_total_kurus: returnsTotal,
    capital_injected_kurus: capitalInjected,
    owner_withdrawn_kurus: ownerWithdrawn,
    expected_cash_kurus: expectedCash,
    opening_balance_kurus: openingBalance,
    salary_expenses_kurus: salaryExpenses,
    technical_service_revenue_kurus: technicalServiceRevenue,
    technical_service_expense_kurus: totalServiceCosts,
    missing_cost_warning: missingCostWarning,
    estimated_profit_kurus: estimatedProfit,
    realized_net_profit_kurus: realizedNetProfit,
    open_credit_total_kurus: openCreditTotal,
    overdue_credit_total_kurus: overdueCreditTotal,
    overdue_customer_count: overdueCustomerSet.size,
    uncollected_credit_risk_kurus: uncollectedCreditRisk,
    prudent_financial_result_kurus: prudentFinancialResult,
    cash_reserve_target_kurus: cashReserveTarget,
    excess_cash_to_bank_kurus: excessCashToBank,
    bank_deposits_total_kurus: bankDepositsTotal,
    reserve_deficit_kurus: reserveDeficit,
    usd_balance_cents: usdBalanceCents,
    eur_balance_cents: eurBalanceCents,
    usd_rate: fxRates.usdRate,
    eur_rate: fxRates.eurRate,
    fx_rate_source: fxRates.source,
    fx_rate_as_of: fxRates.asOf,
    fx_rate_fallback: fxRates.isFallback,
    usd_tl_equivalent_kurus: usdTLEquivalentKurus,
    eur_tl_equivalent_kurus: eurTLEquivalentKurus,
    total_fx_tl_equivalent_kurus: totalFxTLEquivalentKurus,
    total_asset_try_equivalent_kurus: totalAssetTRYEquivalentKurus,
    realized_fx_diff_total_kurus: realizedFxDiffTotal,
  };
}

export async function createSaleTransaction(
  actorUserId: string,
  input: {
    category_id: string;
    product_name: string;
    brand?: string;
    model?: string;
    product_code?: string;
    quantity: number;
    unit_price_kurus: number;
    cash_paid_kurus: number;
    card_paid_kurus: number;
    bank_transfer_paid_kurus?: number;
    bank_transfer_reference?: string;
    credit_paid_kurus?: number;
    credit_customer_id?: string;
    usd_paid_cents?: number;
    usd_rate?: number;
    usd_tl_equivalent_kurus?: number;
    eur_paid_cents?: number;
    eur_rate?: number;
    eur_tl_equivalent_kurus?: number;
    description?: string;
    customer_name?: string;
    customer_phone?: string;
    serial_imei?: string;
    cost_price_kurus?: number;
    service_cost_kurus?: number;
    service_cost_payment_status?: 'paid_from_cash' | 'paid_from_bank' | 'used_from_stock' | 'previously_paid' | 'previously_paid_or_stock' | 'unpaid' | 'no_cost' | 'legacy_unspecified';
    service_cost_payment_source?: string;
    service_cost_bank_account_id?: string;
    technical_service_details?: TechnicalServiceDetails;
    idempotency_key?: string;
  }
): Promise<KasaSale> {
  const supabase = getSupabaseAdmin();
  const day = await getOrCreateTodayDay(actorUserId);
  const creditPaidKurus = input.credit_paid_kurus || 0;

  if (creditPaidKurus > 0) {
    if (!input.credit_customer_id) {
      throw new Error('CARİ_MÜŞTERİ_ZORUNLU: Veresiye / Cari ödemeli satışlarda cari müşteri seçilmesi zorunludur.');
    }

    const { data: customer } = await supabase.from('credit_customers').select('id, full_name, status').eq('id', input.credit_customer_id).single();
    if (!customer || customer.status !== 'active') {
      throw new Error('GEÇERSİZ_MÜŞTERİ: Seçilen cari müşteri aktif değil veya bulunamadı.');
    }

    const { data: account } = await supabase.from('credit_accounts').select('id, credit_limit, current_balance, status').eq('credit_customer_id', input.credit_customer_id).single();
    if (!account || account.status !== 'active') {
      throw new Error('GEÇERSİZ_HESAP: Seçilen müşterinin onaylı cari hesabı bulunmamaktadır.');
    }

    const creditLimit = Number(account.credit_limit || 0);
    const currentBalance = Number(account.current_balance || 0);
    const availableLimit = Math.max(creditLimit - currentBalance, 0);
    const requiredLimitTL = creditPaidKurus / 100.0;

    if (requiredLimitTL > availableLimit + 0.01) {
      throw new Error(`YETERSİZ_LİMİT: Müşterinin kullanılabilir cari limiti (${availableLimit.toFixed(2)} TL), veresiye tutarından (${requiredLimitTL.toFixed(2)} TL) küçüktür.`);
    }
  }

  const { data: categoryObj } = await supabase
    .from('kasa_categories')
    .select('name')
    .eq('id', input.category_id)
    .single();

  if (categoryObj?.name === 'Teknik Servis') {
    const trimmedName = input.customer_name ? input.customer_name.trim() : '';
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 120) {
      throw new Error('Teknik servis işlemlerinde müşteri adı soyadı zorunludur.');
    }
  }

  const { data, error } = await supabase.rpc('fn_kasa_create_sale', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: day.id,
    p_category_id: input.category_id,
    p_quantity: input.quantity,
    p_unit_price_kurus: input.unit_price_kurus,
    p_total_price_kurus: input.quantity * input.unit_price_kurus,
    p_cost_price_kurus: input.cost_price_kurus || 0,
    p_service_cost_kurus: input.service_cost_kurus || 0,
    p_cash_paid_kurus: input.cash_paid_kurus || 0,
    p_card_paid_kurus: input.card_paid_kurus || 0,
    p_bank_transfer_paid_kurus: input.bank_transfer_paid_kurus || 0,
    p_bank_transfer_reference: input.bank_transfer_reference || null,
    p_usd_paid_cents: input.usd_paid_cents || 0,
    p_usd_rate: input.usd_rate || null,
    p_usd_tl_equivalent_kurus: input.usd_tl_equivalent_kurus || 0,
    p_eur_paid_cents: input.eur_paid_cents || 0,
    p_eur_rate: input.eur_rate || null,
    p_eur_tl_equivalent_kurus: input.eur_tl_equivalent_kurus || 0,
    p_credit_customer_id: input.credit_customer_id || null,
    p_credit_paid_kurus: creditPaidKurus,
    p_uncollected_credit_kurus: 0,
    p_uncollected_cost_kurus: 0,
    p_description: input.description || null,
    p_customer_name: input.customer_name || null,
    p_customer_phone: input.customer_phone || null,
    p_serial_imei: input.serial_imei || null,
    p_technical_service_details: input.technical_service_details || null,
    p_service_cost_payment_status: input.service_cost_payment_status ?? null,
    p_service_cost_payment_source: input.service_cost_payment_source ?? null,
    p_service_cost_bank_account_id: input.service_cost_bank_account_id ?? null,
    p_idempotency_key: input.idempotency_key || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Satış kaydı oluşturulamadı.');
  }

  const saleId = (data as any)?.sale_id || (data as any)?.id;
  let sale = data as KasaSale;

  if (saleId) {
    if (input.customer_name || input.customer_phone || input.serial_imei) {
      await supabase
        .from('kasa_sales')
        .update({
          customer_name: input.customer_name ? input.customer_name.trim() : null,
          customer_phone: input.customer_phone ? input.customer_phone.trim() : null,
          serial_imei: input.serial_imei ? input.serial_imei.trim() : null,
        })
        .eq('id', saleId);
    }

    const { data: fullSale } = await supabase
      .from('kasa_sales')
      .select(`
        *,
        category:kasa_categories(name),
        user:kasa_users(full_name)
      `)
      .eq('id', saleId)
      .maybeSingle();

    if (fullSale) {
      sale = {
        ...fullSale,
        category_name: (fullSale.category as any)?.name || 'Bilinmeyen Kategori',
        created_by_name: (fullSale.user as any)?.full_name || 'Bilinmeyen Personel',
      } as KasaSale;
    }
  }

  return sale;
}

export async function collectCreditPaymentTransaction(
  actorUserId: string,
  input: {
    day_id: string;
    credit_customer_id: string;
    amount_tl: number;
    payment_method: 'cash' | 'card' | 'bank_transfer' | 'usd' | 'eur';
    cash_paid_tl?: number;
    card_paid_tl?: number;
    bank_transfer_paid_tl?: number;
    bank_transfer_reference?: string;
    usd_paid?: number;
    usd_rate?: number;
    eur_paid?: number;
    eur_rate?: number;
    description?: string;
    idempotency_key?: string;
  }
): Promise<KasaCreditPayment> {
  const supabase = getSupabaseAdmin();
  const amountKurus = Math.round(input.amount_tl * 100);
  const cashPaidKurus = input.cash_paid_tl ? Math.round(input.cash_paid_tl * 100) : (input.payment_method === 'cash' ? amountKurus : 0);
  const cardPaidKurus = input.card_paid_tl ? Math.round(input.card_paid_tl * 100) : (input.payment_method === 'card' ? amountKurus : 0);
  const bankTransferPaidKurus = input.bank_transfer_paid_tl ? Math.round(input.bank_transfer_paid_tl * 100) : (input.payment_method === 'bank_transfer' ? amountKurus : 0);

  const usdPaidCents = input.usd_paid ? Math.round(input.usd_paid * 100) : 0;
  const usdTLEquivalentKurus = usdPaidCents > 0 && input.usd_rate ? Math.round((usdPaidCents / 100.0) * input.usd_rate * 100) : 0;

  const eurPaidCents = input.eur_paid ? Math.round(input.eur_paid * 100) : 0;
  const eurTLEquivalentKurus = eurPaidCents > 0 && input.eur_rate ? Math.round((eurPaidCents / 100.0) * input.eur_rate * 100) : 0;

  const { data, error } = await supabase.rpc('fn_kasa_collect_credit_payment', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: input.day_id,
    p_credit_customer_id: input.credit_customer_id,
    p_amount_kurus: amountKurus,
    p_payment_method: input.payment_method,
    p_cash_paid_kurus: cashPaidKurus,
    p_card_paid_kurus: cardPaidKurus,
    p_usd_paid_cents: usdPaidCents,
    p_usd_rate: input.usd_rate || null,
    p_usd_tl_equivalent_kurus: usdTLEquivalentKurus,
    p_eur_paid_cents: eurPaidCents,
    p_eur_rate: input.eur_rate || null,
    p_eur_tl_equivalent_kurus: eurTLEquivalentKurus,
    p_description: input.description || null,
    p_idempotency_key: input.idempotency_key || null,
    p_bank_transfer_paid_kurus: bankTransferPaidKurus,
    p_bank_transfer_reference: input.bank_transfer_reference || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Cari tahsilat kaydı oluşturulamadı.');
  }

  return data as KasaCreditPayment;
}

export async function getDailyCategorySummary(dayId: string): Promise<KasaCategorySummary[]> {
  const supabase = getSupabaseAdmin();
  const categories = await getKasaCategories();

  const { data: sales } = await supabase
    .from('kasa_sales')
    .select('category_id, quantity, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, credit_paid_kurus, total_price_kurus')
    .eq('kasa_day_id', dayId)
    .eq('status', 'completed');

  const catMap = new Map<string, { count: number; cash: number; card: number; bankTransfer: number; credit: number; grand: number }>();

  for (const s of sales || []) {
    const cur = catMap.get(s.category_id) || { count: 0, cash: 0, card: 0, bankTransfer: 0, credit: 0, grand: 0 };
    catMap.set(s.category_id, {
      count: cur.count + s.quantity,
      cash: cur.cash + Number(s.cash_paid_kurus || 0),
      card: cur.card + Number(s.card_paid_kurus || 0),
      bankTransfer: cur.bankTransfer + Number(s.bank_transfer_paid_kurus || 0),
      credit: cur.credit + Number(s.credit_paid_kurus || 0),
      grand: cur.grand + Number(s.total_price_kurus || 0),
    });
  }

  return categories.map((cat) => {
    const st = catMap.get(cat.id) || { count: 0, cash: 0, card: 0, bankTransfer: 0, credit: 0, grand: 0 };
    return {
      category_id: cat.id,
      category_name: cat.name,
      count: st.count,
      cash_total_kurus: st.cash,
      card_total_kurus: st.card,
      bank_transfer_total_kurus: st.bankTransfer,
      credit_total_kurus: st.credit,
      grand_total_kurus: st.grand,
    };
  });
}

export async function convertFXToTRYTransaction(
  actorUserId: string,
  dayId: string,
  currencyCode: 'USD' | 'EUR',
  foreignAmountCents: number,
  actualRateNumeric: number,
  description?: string,
  idempotencyKey?: string
): Promise<KasaFXTransaction> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_convert_fx_to_try', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_currency_code: currencyCode,
    p_foreign_amount_cents: foreignAmountCents,
    p_actual_rate_numeric: actualRateNumeric,
    p_description: description || null,
    p_idempotency_key: idempotencyKey || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Döviz bozdurma işlemi başarısız.');
  }

  return data as KasaFXTransaction;
}

export async function injectFXCapitalTransaction(
  actorUserId: string,
  dayId: string,
  currencyCode: 'USD' | 'EUR',
  foreignAmountCents: number,
  exchangeRate: number,
  description?: string
): Promise<KasaFXTransaction> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_inject_fx_capital', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_currency_code: currencyCode,
    p_foreign_amount_cents: foreignAmountCents,
    p_exchange_rate: exchangeRate,
    p_description: description || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Döviz sermayesi eklenemedi.');
  }

  return data as KasaFXTransaction;
}

export async function depositToBankTransaction(
  actorUserId: string,
  dayId: string,
  amountKurus: number,
  bankName?: string,
  referenceNo?: string,
  description?: string,
  idempotencyKey?: string
): Promise<KasaBankDeposit> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_deposit_to_bank', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_amount_kurus: amountKurus,
    p_bank_name: bankName || null,
    p_reference_no: referenceNo || null,
    p_description: description || null,
    p_idempotency_key: idempotencyKey || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Bankaya para yatırma işlemi başarısız.');
  }

  return data as KasaBankDeposit;
}

export async function listDailyBankDeposits(dayId: string): Promise<KasaBankDeposit[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_bank_deposits')
    .select(`
      *,
      user:kasa_users(full_name),
      bank_account:kasa_bank_accounts(account_name)
    `)
    .eq('kasa_day_id', dayId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((item) => ({
    ...item,
    created_by_name: item.user?.full_name || 'Yönetici',
  })) as KasaBankDeposit[];
}

export async function injectCapitalTransaction(
  actorUserId: string,
  dayId: string,
  amountKurus: number,
  description: string
): Promise<KasaDay> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_inject_capital', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_amount_kurus: amountKurus,
    p_description: description,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Sermaye girişi yapılamadı.');
  }

  return data as KasaDay;
}

export async function withdrawOwnerTransaction(
  actorUserId: string,
  dayId: string,
  amountKurus: number,
  justification: string
): Promise<KasaDay> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_withdraw_owner', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_amount_kurus: amountKurus,
    p_justification: justification,
  });

  if (error || !data) {
    throw new Error(error?.message || 'İşletme sahibi çekimi yapılamadı.');
  }

  return data as KasaDay;
}

export async function listDailySales(dayId: string): Promise<KasaSale[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_sales')
    .select(`
      *,
      category:kasa_categories(name),
      user:kasa_users(full_name),
      credit_customer:credit_customers(full_name)
    `)
    .eq('kasa_day_id', dayId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((item) => {
    const ov = calculateOverdueDays(item.created_at, 7);
    return {
      ...item,
      category_name: item.category?.name || 'Bilinmeyen Kategori',
      created_by_name: item.user?.full_name || 'Bilinmeyen Personel',
      credit_customer_name: item.credit_customer?.full_name,
      overdue_days: ov.ageDays,
      is_overdue: ov.isOverdue && Number(item.uncollected_credit_kurus || 0) > 0,
    };
  }) as KasaSale[];
}

export async function cancelSaleTransaction(
  actorUserId: string,
  saleId: string,
  justification: string,
  costRefunded?: boolean
): Promise<KasaSale> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_cancel_sale', {
    p_actor_user_id: actorUserId,
    p_sale_id: saleId,
    p_justification: justification,
    p_cost_refunded: costRefunded ?? false,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Satış iptal edilemedi.');
  }

  return data as KasaSale;
}

export async function updateSaleTransaction(
  actorUserId: string,
  saleId: string,
  saleData: {
    category_id: string;
    product_name: string;
    quantity: number;
    unit_price_kurus: number;
    cash_paid_kurus?: number;
    card_paid_kurus?: number;
    bank_transfer_paid_kurus?: number;
    bank_transfer_reference?: string;
    usd_paid_cents?: number;
    usd_rate?: number;
    usd_tl_equivalent_kurus?: number;
    eur_paid_cents?: number;
    eur_rate?: number;
    eur_tl_equivalent_kurus?: number;
    credit_paid_kurus?: number;
    credit_customer_id?: string;
    justification: string;
    customer_name?: string;
    customer_phone?: string;
    serial_imei?: string;
    description?: string;
    cost_price_kurus?: number;
    service_cost_kurus?: number;
    service_cost_payment_status?: 'paid_from_cash' | 'paid_from_bank' | 'used_from_stock' | 'previously_paid' | 'previously_paid_or_stock' | 'unpaid' | 'no_cost' | 'legacy_unspecified';
    service_cost_payment_source?: string;
    service_cost_bank_account_id?: string;
    idempotency_key?: string;
  }
): Promise<KasaSale> {
  const supabase = getSupabaseAdmin();

  const { data: categoryObj } = await supabase
    .from('kasa_categories')
    .select('name')
    .eq('id', saleData.category_id)
    .single();

  if (categoryObj?.name === 'Teknik Servis') {
    const trimmedName = saleData.customer_name ? saleData.customer_name.trim() : '';
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 120) {
      throw new Error('Teknik servis işlemlerinde müşteri adı soyadı zorunludur.');
    }
  }

  const { data, error } = await supabase.rpc('fn_kasa_update_sale', {
    p_actor_user_id: actorUserId,
    p_sale_id: saleId,
    p_category_id: saleData.category_id,
    p_product_name: saleData.product_name,
    p_quantity: saleData.quantity,
    p_unit_price_kurus: saleData.unit_price_kurus,
    p_total_price_kurus: saleData.quantity * saleData.unit_price_kurus,
    p_cost_price_kurus: saleData.cost_price_kurus || 0,
    p_service_cost_kurus: saleData.service_cost_kurus || 0,
    p_cash_paid_kurus: saleData.cash_paid_kurus || 0,
    p_card_paid_kurus: saleData.card_paid_kurus || 0,
    p_bank_transfer_paid_kurus: saleData.bank_transfer_paid_kurus || 0,
    p_bank_transfer_reference: saleData.bank_transfer_reference || null,
    p_usd_paid_cents: saleData.usd_paid_cents || 0,
    p_usd_rate: saleData.usd_rate || null,
    p_usd_tl_equivalent_kurus: saleData.usd_tl_equivalent_kurus || 0,
    p_eur_paid_cents: saleData.eur_paid_cents || 0,
    p_eur_rate: saleData.eur_rate || null,
    p_eur_tl_equivalent_kurus: saleData.eur_tl_equivalent_kurus || 0,
    p_credit_customer_id: saleData.credit_customer_id || null,
    p_credit_paid_kurus: saleData.credit_paid_kurus || 0,
    p_uncollected_credit_kurus: 0,
    p_uncollected_cost_kurus: 0,
    p_justification: saleData.justification,
    p_customer_name: saleData.customer_name || null,
    p_customer_phone: saleData.customer_phone || null,
    p_serial_imei: saleData.serial_imei || null,
    p_description: saleData.description || null,
    p_service_cost_payment_status: saleData.service_cost_payment_status || null,
    p_service_cost_payment_source: saleData.service_cost_payment_source || (saleData.service_cost_payment_status === 'paid_from_bank' ? 'bank' : null),
    p_service_cost_bank_account_id: saleData.service_cost_bank_account_id || null,
    p_idempotency_key: saleData.idempotency_key || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Satış düzeltilemedi.');
  }

  return data as KasaSale;
}

export async function createExpense(
  actorUserId: string,
  dayId: string,
  expenseCategoryId: string,
  amountKurus: number,
  description: string,
  recipientName?: string,
  saleId?: string,
  paymentMethod: 'cash' | 'bank' = 'cash',
  bankAccountId?: string,
  idempotencyKey?: string
): Promise<KasaExpense> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_create_expense', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_expense_category_id: expenseCategoryId,
    p_amount_kurus: amountKurus,
    p_description: description.trim(),
    p_recipient_name: recipientName ? recipientName.trim() : null,
    p_sale_id: saleId || null,
    p_payment_method: paymentMethod,
    p_bank_account_id: bankAccountId || null,
    p_idempotency_key: idempotencyKey || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Gider kaydı eklenemedi.');
  }

  return data as KasaExpense;
}

export async function updateExpenseTransaction(
  actorUserId: string,
  expenseId: string,
  expenseCategoryId: string,
  amountKurus: number,
  description: string,
  recipientName?: string,
  justification?: string,
  paymentMethod: 'cash' | 'bank' = 'cash',
  bankAccountId?: string
): Promise<KasaExpense> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_update_expense', {
    p_actor_user_id: actorUserId,
    p_expense_id: expenseId,
    p_expense_category_id: expenseCategoryId,
    p_amount_kurus: amountKurus,
    p_description: description.trim(),
    p_recipient_name: recipientName ? recipientName.trim() : null,
    p_justification: justification ? justification.trim() : null,
    p_payment_method: paymentMethod,
    p_bank_account_id: bankAccountId || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Gider kaydı düzeltilemedi.');
  }

  return data as KasaExpense;
}

export async function cancelExpenseTransaction(
  actorUserId: string,
  expenseId: string,
  justification: string
): Promise<KasaExpense> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_cancel_expense', {
    p_actor_user_id: actorUserId,
    p_expense_id: expenseId,
    p_justification: justification.trim(),
  });

  if (error || !data) {
    throw new Error(error?.message || 'Gider kaydı iptal edilemedi.');
  }

  return data as KasaExpense;
}

export async function listDailyExpenses(dayId: string, actorRole?: KasaUserRole): Promise<KasaExpense[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('kasa_expenses')
    .select(`
      *,
      category:kasa_expense_categories(name, is_salary_category),
      user:kasa_users(full_name)
    `)
    .eq('kasa_day_id', dayId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data
    .filter((item) => {
      if (actorRole === 'personel' && (item.category?.is_salary_category || item.category?.name === 'Personel Maaşı')) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      category_name: item.category?.name || 'Gider',
      created_by_name: item.user?.full_name || 'Personel',
      bank_account_name: item.bank_account?.account_name,
    })) as KasaExpense[];
}

export interface ExpenseListOptions {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  statusFilter?: 'all' | 'active' | 'cancelled';
  createdById?: string;
  actorRole?: KasaUserRole;
}

export async function listAllExpenses(options: ExpenseListOptions = {}): Promise<any[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('kasa_expenses')
    .select(`
      *,
      category:kasa_expense_categories(id, name, is_salary_category),
      user:kasa_users!created_by_user_id(id, full_name),
      canceller:kasa_users!cancelled_by_user_id(id, full_name),
      kasa_day:kasa_days(date_val),
      bank_account:kasa_bank_accounts(account_name)
    `)
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter !== 'all') {
    query = query.eq('status', options.statusFilter);
  }

  if (options.categoryId) {
    query = query.eq('expense_category_id', options.categoryId);
  }

  if (options.createdById) {
    query = query.eq('created_by_user_id', options.createdById);
  }

  const { data, error } = await query;

  if (error) {
    // If join fails, fall back to safe manual join via separate queries
    const { data: rawExpenses, error: rawError } = await supabase
      .from('kasa_expenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (rawError || !rawExpenses) {
      throw new Error(`Gider listesi veritabanından alınamadı: ${error?.message || rawError?.message}`);
    }

    const { data: categories } = await supabase.from('kasa_expense_categories').select('id, name, is_salary_category');
    const { data: users } = await supabase.from('kasa_users').select('id, full_name');
    const { data: days } = await supabase.from('kasa_days').select('id, date_val');
    const { data: bankAccounts } = await supabase.from('kasa_bank_accounts').select('id, account_name');

    const catMap = new Map((categories || []).map((c) => [c.id, c]));
    const userMap = new Map((users || []).map((u) => [u.id, u.full_name]));
    const dayMap = new Map((days || []).map((d) => [d.id, d.date_val]));
    const bankMap = new Map((bankAccounts || []).map((a) => [a.id, a.account_name]));

    return rawExpenses
      .filter((item) => {
        const cat = catMap.get(item.expense_category_id);
        if (options.actorRole === 'personel' && (cat?.is_salary_category || cat?.name === 'Personel Maaşı')) {
          return false;
        }
        if (options.statusFilter && options.statusFilter !== 'all' && item.status !== options.statusFilter) {
          return false;
        }
        if (options.categoryId && item.expense_category_id !== options.categoryId) {
          return false;
        }
        if (options.createdById && item.created_by_user_id !== options.createdById) {
          return false;
        }
        return true;
      })
      .map((item) => {
        const cat = catMap.get(item.expense_category_id);
        const isActive = item.status === 'active';
        return {
          ...item,
          category_name: cat?.name || 'Gider',
          created_by_name: userMap.get(item.created_by_user_id) || 'Personel',
          cancelled_by_name: item.cancelled_by_user_id ? userMap.get(item.cancelled_by_user_id) || 'Yönetici' : null,
          kasa_day_date: dayMap.get(item.kasa_day_id) || item.created_at.split('T')[0],
          bank_account_name: item.bank_account_id ? bankMap.get(item.bank_account_id) : undefined,
          net_financial_effect_kurus: isActive ? -Number(item.amount_kurus || 0) : 0,
        };
      });
  }

  return (data || [])
    .filter((item) => {
      const cat = Array.isArray(item.category) ? item.category[0] : item.category;
      if (options.actorRole === 'personel' && (cat?.is_salary_category || cat?.name === 'Personel Maaşı')) {
        return false;
      }
      return true;
    })
    .map((item) => {
      const cat = Array.isArray(item.category) ? item.category[0] : item.category;
      const creator = Array.isArray(item.user) ? item.user[0] : item.user;
      const canceller = Array.isArray(item.canceller) ? item.canceller[0] : item.canceller;
      const day = Array.isArray(item.kasa_day) ? item.kasa_day[0] : item.kasa_day;
      const bankAccount = Array.isArray(item.bank_account) ? item.bank_account[0] : item.bank_account;
      const isActive = item.status === 'active';

      return {
        ...item,
        category_name: cat?.name || 'Gider',
        created_by_name: creator?.full_name || 'Personel',
        cancelled_by_name: canceller?.full_name || null,
        kasa_day_date: day?.date_val || item.created_at.split('T')[0],
        bank_account_name: bankAccount?.account_name,
        net_financial_effect_kurus: isActive ? -Number(item.amount_kurus || 0) : 0,
      };
    });
}

export async function closeDayTransaction(
  actorUserId: string,
  dayId: string,
  countedCashKurus: number,
  closingNote?: string,
  countedUsdCents?: number,
  countedEurCents?: number
): Promise<KasaDay> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_close_day', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: dayId,
    p_counted_cash_kurus: countedCashKurus,
    p_closing_note: closingNote || null,
    p_counted_usd_cents: countedUsdCents ?? null,
    p_counted_eur_cents: countedEurCents ?? null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Gün sonu kapatılamadı.');
  }

  return data as KasaDay;
}

export async function getPeriodReportMetrics(
  periodName: string,
  startDateStr: string,
  endDateStr: string,
  actorRole?: KasaUserRole
): Promise<KasaPeriodReportMetrics> {
  const supabase = getSupabaseAdmin();

  const { data: days } = await supabase
    .from('kasa_days')
    .select('*')
    .gte('date_val', startDateStr)
    .lte('date_val', endDateStr)
    .order('date_val', { ascending: true });

  const firstDay = days && days.length > 0 ? days[0] : null;
  const lastDay = days && days.length > 0 ? days[days.length - 1] : null;

  const openingBalanceKurus = Number(firstDay?.opening_balance_kurus || 0);
  const closingBalanceKurus = Number(lastDay?.counted_cash_kurus ?? lastDay?.expected_cash_kurus ?? 0);

  let capitalInjectedKurus = 0;
  let ownerWithdrawnKurus = 0;
  for (const d of days || []) {
    capitalInjectedKurus += Number(d.capital_injected_kurus || 0);
    ownerWithdrawnKurus += Number(d.owner_withdrawn_kurus || 0);
  }

  const startISO = `${startDateStr}T00:00:00.000Z`;
  const endISO = `${endDateStr}T23:59:59.999Z`;

  const { data: sales } = await supabase
    .from('kasa_sales')
    .select(`
      id, quantity, unit_price_kurus, total_price_kurus, cost_price_kurus, service_cost_kurus,
      cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus,
      usd_paid_cents, eur_paid_cents, category_id, status, created_at,
      category:kasa_categories(name)
    `)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .eq('status', 'completed');

  const { data: creditPayments } = await supabase
    .from('kasa_credit_payments')
    .select('amount_kurus, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const { data: allOpenSales } = await supabase
    .from('kasa_sales')
    .select('uncollected_credit_kurus, created_at')
    .eq('status', 'completed')
    .gt('uncollected_credit_kurus', 0);

  const { data: expenses } = await supabase
    .from('kasa_expenses')
    .select(`
      amount_kurus, expense_category_id, sale_id,
      category:kasa_expense_categories(name, is_salary_category)
    `)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const { data: bankDeposits } = await supabase
    .from('kasa_bank_deposits')
    .select('amount_kurus')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const { data: fxTransactions } = await supabase
    .from('kasa_fx_transactions')
    .select('*')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const categories = await getKasaCategories();
  const expenseCategories = await getKasaExpenseCategories();

  let grossSalesKurus = 0;
  let cashCollectionKurus = 0;
  let cardCollectionKurus = 0;
  let bankTransferCollectionKurus = 0;
  let creditSalesTotalKurus = 0;
  let totalProductCostKurus = 0;
  let uncollectedProductCostKurus = 0;
  let technicalServiceRevenueKurus = 0;
  let technicalServiceExpenseFromSales = 0;
  let missingCostSalesCount = 0;
  let usdSalesCount = 0;
  let usdTotalCents = 0;
  let eurSalesCount = 0;
  let eurTotalCents = 0;

  const salesCatMap = new Map<string, { count: number; cash: number; card: number; bankTransfer: number; grand: number }>();

  for (const s of sales || []) {
    grossSalesKurus += Number(s.total_price_kurus || 0);
    cashCollectionKurus += Number(s.cash_paid_kurus || 0);
    cardCollectionKurus += Number(s.card_paid_kurus || 0);
    bankTransferCollectionKurus += Number(s.bank_transfer_paid_kurus || 0);
    creditSalesTotalKurus += Number(s.credit_paid_kurus || 0);

    if (s.usd_paid_cents > 0) {
      usdSalesCount++;
      usdTotalCents += Number(s.usd_paid_cents);
    }
    if (s.eur_paid_cents > 0) {
      eurSalesCount++;
      eurTotalCents += Number(s.eur_paid_cents);
    }

    const catName = (s.category as any)?.name;
    const catId = s.category_id;

    const cur = salesCatMap.get(catId) || { count: 0, cash: 0, card: 0, bankTransfer: 0, grand: 0 };
    salesCatMap.set(catId, {
      count: cur.count + s.quantity,
      cash: cur.cash + Number(s.cash_paid_kurus || 0),
      card: cur.card + Number(s.card_paid_kurus || 0),
      bankTransfer: cur.bankTransfer + Number(s.bank_transfer_paid_kurus || 0),
      grand: cur.grand + Number(s.total_price_kurus || 0),
    });

    if (catName === 'Teknik Servis') {
      technicalServiceRevenueKurus += Number(s.total_price_kurus || 0);
      if (s.service_cost_kurus !== null && s.service_cost_kurus !== undefined) {
        technicalServiceExpenseFromSales += Number(s.service_cost_kurus || 0);
      }
    } else {
      if (s.cost_price_kurus === null || s.cost_price_kurus === undefined) {
        missingCostSalesCount++;
      } else {
        totalProductCostKurus += Number(s.cost_price_kurus || 0) * s.quantity;
        uncollectedProductCostKurus += Number(s.uncollected_cost_kurus || 0);
      }
    }
  }

  let creditCollectionsTotalKurus = 0;
  for (const cp of creditPayments || []) {
    creditCollectionsTotalKurus += Number(cp.amount_kurus || 0);
    cashCollectionKurus += Number(cp.cash_paid_kurus || 0);
    cardCollectionKurus += Number(cp.card_paid_kurus || 0);
    bankTransferCollectionKurus += Number(cp.bank_transfer_paid_kurus || 0);
  }

  let openCreditTotalKurus = 0;
  let overdueCreditTotalKurus = 0;

  for (const os of allOpenSales || []) {
    const amt = Number(os.uncollected_credit_kurus || 0);
    openCreditTotalKurus += amt;
    const ov = calculateOverdueDays(os.created_at, 7);
    if (ov.isOverdue) {
      overdueCreditTotalKurus += amt;
    }
  }

  const categorySummaries: KasaCategorySummary[] = categories.map((cat) => {
    const st = salesCatMap.get(cat.id) || { count: 0, cash: 0, card: 0, bankTransfer: 0, grand: 0 };
    return {
      category_id: cat.id,
      category_name: cat.name,
      count: st.count,
      cash_total_kurus: st.cash,
      card_total_kurus: st.card,
      bank_transfer_total_kurus: st.bankTransfer,
      grand_total_kurus: st.grand,
    };
  });

  let totalExpensesKurus = 0;
  let salaryExpensesKurus = 0;
  let technicalServiceExpenseFromExpenses = 0;
  const expCatMap = new Map<string, number>();

  for (const e of expenses || []) {
    const amt = Number(e.amount_kurus || 0);
    const catName = (e.category as any)?.name;
    const isSalary = (e.category as any)?.is_salary_category;

    if (actorRole === 'personel' && (isSalary || catName === 'Personel Maaşı')) {
      continue;
    }

    totalExpensesKurus += amt;
    expCatMap.set(e.expense_category_id, (expCatMap.get(e.expense_category_id) || 0) + amt);

    if (isSalary || catName === 'Personel Maaşı') {
      salaryExpensesKurus += amt;
    } else if (catName === 'Teknik Servis Gideri' && !e.sale_id) {
      technicalServiceExpenseFromExpenses += amt;
    }
  }

  let bankDepositsTotalKurus = 0;
  for (const b of bankDeposits || []) {
    bankDepositsTotalKurus += Number(b.amount_kurus || 0);
  }

  let realizedFxDiffTotalKurus = 0;
  for (const fx of fxTransactions || []) {
    if (fx.transaction_type === 'fx_conversion_to_try') {
      realizedFxDiffTotalKurus += Number(fx.realized_fx_diff_kurus || 0);
    }
  }

  const expenseSummaries = expenseCategories.map((ec) => ({
    category_id: ec.id,
    category_name: ec.name,
    amount_kurus: expCatMap.get(ec.id) || 0,
  }));

  const totalServiceCosts = technicalServiceExpenseFromSales + technicalServiceExpenseFromExpenses;
  const collectedProductCostKurus = totalProductCostKurus - uncollectedProductCostKurus;
  const realizedSalesRevenueKurus = grossSalesKurus - creditSalesTotalKurus;

  const realizedNetProfitKurus = realizedSalesRevenueKurus - collectedProductCostKurus - totalServiceCosts - totalExpensesKurus + realizedFxDiffTotalKurus;
  const uncollectedCreditRiskKurus = openCreditTotalKurus;
  const prudentFinancialResultKurus = calculatePrudentResult(realizedNetProfitKurus, uncollectedCreditRiskKurus);

  return {
    period_name: periodName,
    start_date: startDateStr,
    end_date: endDateStr,
    opening_balance_kurus: openingBalanceKurus,
    closing_balance_kurus: closingBalanceKurus,
    capital_injected_kurus: capitalInjectedKurus,
    owner_withdrawn_kurus: ownerWithdrawnKurus,
    gross_sales_kurus: grossSalesKurus,
    cash_collection_kurus: cashCollectionKurus,
    card_collection_kurus: cardCollectionKurus,
    bank_transfer_collection_kurus: bankTransferCollectionKurus,
    credit_sales_total_kurus: creditSalesTotalKurus,
    credit_collections_total_kurus: creditCollectionsTotalKurus,
    returns_total_kurus: 0,
    total_expenses_kurus: totalExpensesKurus,
    salary_expenses_kurus: salaryExpensesKurus,
    technical_service_revenue_kurus: technicalServiceRevenueKurus,
    technical_service_expense_kurus: totalServiceCosts,
    total_product_cost_kurus: totalProductCostKurus,
    realized_net_profit_kurus: realizedNetProfitKurus,
    uncollected_credit_risk_kurus: uncollectedCreditRiskKurus,
    prudent_financial_result_kurus: prudentFinancialResultKurus,
    missing_cost_sales_count: missingCostSalesCount,
    missing_cost_warning: missingCostSalesCount > 0,
    bank_deposits_total_kurus: bankDepositsTotalKurus,
    usd_sales_count: usdSalesCount,
    usd_total_cents: usdTotalCents,
    eur_sales_count: eurSalesCount,
    eur_total_cents: eurTotalCents,
    realized_fx_diff_total_kurus: realizedFxDiffTotalKurus,
    open_credit_total_kurus: openCreditTotalKurus,
    overdue_credit_total_kurus: overdueCreditTotalKurus,
    category_summaries: categorySummaries,
    expense_summaries: expenseSummaries,
  };
}

export async function getMonthlyReport(monthISO: string, actorRole?: KasaUserRole): Promise<KasaMonthlyReport> {
  const supabase = getSupabaseAdmin();

  const [yearStr, monthStr] = monthISO.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  // 1. Sales in month
  const { data: sales } = await supabase
    .from('kasa_sales')
    .select(`
      *,
      category:kasa_categories(name)
    `)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .eq('status', 'completed');

  let gross_sales_kurus = 0;
  let cash_sales_kurus = 0;
  let card_sales_kurus = 0;
  let bank_transfer_sales_kurus = 0;
  let technical_service_revenue_kurus = 0;
  let product_sales_cost_kurus = 0;
  let technical_service_direct_cost_kurus = 0;
  let ts_cost_paid_from_cash_kurus = 0;
  let ts_cost_unpaid_kurus = 0;
  let monthly_credit_sales_kurus = 0;
  let missing_cost_sales_count = 0;

  for (const s of sales || []) {
    gross_sales_kurus += Number(s.total_price_kurus || 0);
    cash_sales_kurus += Number(s.cash_paid_kurus || 0);
    card_sales_kurus += Number(s.card_paid_kurus || 0);
    bank_transfer_sales_kurus += Number(s.bank_transfer_paid_kurus || 0);
    monthly_credit_sales_kurus += Number(s.credit_paid_kurus || 0);

    const catObj: any = Array.isArray(s.category) ? s.category[0] : s.category;
    const isTS = catObj?.name === 'Teknik Servis';

    if (isTS) {
      technical_service_revenue_kurus += Number(s.total_price_kurus || 0);
      const sCost = Number(s.service_cost_kurus || s.cost_price_kurus || 0);
      const st = s.service_cost_payment_status;

      if (!st || st === 'legacy_unspecified') {
        missing_cost_sales_count++;
      } else if (st === 'no_cost') {
        // Maliyet 0 TL olarak bilinçli tanımlanmış, eksik sayılmaz.
      } else if (st === 'paid_from_cash' || st === 'previously_paid_or_stock' || st === 'unpaid') {
        if (sCost <= 0) {
          missing_cost_sales_count++;
        }
      }

      technical_service_direct_cost_kurus += sCost;

      if (st === 'paid_from_cash') {
        ts_cost_paid_from_cash_kurus += sCost;
      } else if (st === 'unpaid') {
        ts_cost_unpaid_kurus += sCost;
      }
    } else {
      const pCost = Number(s.cost_price_kurus || 0);
      if (pCost === 0 && Number(s.total_price_kurus || 0) > 0) {
        missing_cost_sales_count++;
      }
      product_sales_cost_kurus += pCost * Number(s.quantity || 1);
    }
  }

  // 2. Credit payments collected in month
  const { data: creditPayments } = await supabase
    .from('kasa_credit_payments')
    .select('amount_kurus')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const credit_payments_collected_kurus = (creditPayments || []).reduce((sum, c) => sum + Number(c.amount_kurus || 0), 0);

  // 3. Expenses in month (active only!)
  const { data: expCatList } = await supabase.from('kasa_expense_categories').select('id, name, is_salary_category');
  const expCatMap = new Map<string, { name: string; is_salary_category: boolean }>();
  (expCatList || []).forEach((c: any) => expCatMap.set(c.id, { name: c.name, is_salary_category: !!c.is_salary_category }));

  const { data: expenses } = await supabase
    .from('kasa_expenses')
    .select('amount_kurus, expense_category_id, status')
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .neq('status', 'cancelled');

  let general_operating_expenses_kurus = 0;
  let salary_expenses_kurus = 0;

  for (const e of expenses || []) {
    const expCatObj = expCatMap.get(e.expense_category_id);
    if (expCatObj?.is_salary_category || expCatObj?.name === 'Personel Maaşı') {
      salary_expenses_kurus += Number(e.amount_kurus || 0);
    } else {
      general_operating_expenses_kurus += Number(e.amount_kurus || 0);
    }
  }

  // 4. Open credit balance & overdue
  const { data: openSales } = await supabase
    .from('kasa_sales')
    .select('uncollected_credit_kurus, created_at')
    .eq('status', 'completed')
    .gt('uncollected_credit_kurus', 0);

  let total_open_credit_balance_kurus = 0;
  let overdue_credit_balance_kurus = 0;

  for (const os of openSales || []) {
    const uncoll = Number(os.uncollected_credit_kurus || 0);
    total_open_credit_balance_kurus += uncoll;
    const ageDays = Math.floor((Date.now() - new Date(os.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > 7) {
      overdue_credit_balance_kurus += uncoll;
    }
  }

  // 5. Capital & Withdrawals & Bank Deposits in month
  const { data: days } = await supabase
    .from('kasa_days')
    .select('capital_injected_kurus, owner_withdrawn_kurus, counted_cash_kurus, opening_balance_kurus')
    .gte('date_val', `${yearStr}-${monthStr.padStart(2, '0')}-01`)
    .lte('date_val', `${yearStr}-${monthStr.padStart(2, '0')}-31`);

  const capital_injected_kurus = (days || []).reduce((sum, d) => sum + Number(d.capital_injected_kurus || 0), 0);
  const owner_withdrawn_kurus = (days || []).reduce((sum, d) => sum + Number(d.owner_withdrawn_kurus || 0), 0);

  const { data: bankDeposits } = await supabase
    .from('kasa_bank_deposits')
    .select('amount_kurus')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const bank_deposits_kurus = (bankDeposits || []).reduce((sum, b) => sum + Number(b.amount_kurus || 0), 0);

  const latestDay = days && days.length > 0 ? days[days.length - 1] : null;
  const end_of_month_cash_kurus = latestDay ? Number(latestDay.counted_cash_kurus || latestDay.opening_balance_kurus || 0) : 0;

  // 6. Cancelled sales TS cost & financial loss handling
  const { data: cancelledSales } = await supabase
    .from('kasa_sales')
    .select('service_cost_kurus, cost_price_kurus, service_cost_payment_status, cost_refunded_on_cancel, category:kasa_categories(name)')
    .eq('status', 'cancelled')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  let unrefunded_cancelled_ts_cost_kurus = 0;
  let cancelled_unpaid_ts_cost_kurus = 0;
  let cancelled_stock_ts_cost_kurus = 0;

  for (const cs of cancelledSales || []) {
    const catObj: any = Array.isArray(cs.category) ? cs.category[0] : cs.category;
    if (catObj?.name === 'Teknik Servis') {
      const sCost = Number(cs.service_cost_kurus || cs.cost_price_kurus || 0);
      if (sCost > 0) {
        if (cs.service_cost_payment_status === 'paid_from_cash' && !cs.cost_refunded_on_cancel) {
          unrefunded_cancelled_ts_cost_kurus += sCost;
        } else if (cs.service_cost_payment_status === 'unpaid') {
          cancelled_unpaid_ts_cost_kurus += sCost;
          ts_cost_unpaid_kurus += sCost; // Borç görünmeye devam eder
        } else if (cs.service_cost_payment_status === 'previously_paid_or_stock' || cs.service_cost_payment_status === 'legacy_unspecified') {
          cancelled_stock_ts_cost_kurus += sCost;
        }
      }
    }
  }

  const cancelled_ts_loss_kurus = unrefunded_cancelled_ts_cost_kurus + cancelled_unpaid_ts_cost_kurus + cancelled_stock_ts_cost_kurus;

  const gross_profit_kurus = gross_sales_kurus - product_sales_cost_kurus - technical_service_direct_cost_kurus - cancelled_ts_loss_kurus;

  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const month_label = `${monthNames[month - 1]} ${year}`;

  const safe_salary_expenses = actorRole === 'personel' ? undefined : salary_expenses_kurus;
  const safe_net_profit = actorRole === 'personel' ? (gross_profit_kurus - general_operating_expenses_kurus) : (gross_profit_kurus - general_operating_expenses_kurus - salary_expenses_kurus);

  return {
    month_iso: monthISO,
    month_label,
    gross_sales_kurus,
    cash_sales_kurus,
    card_sales_kurus,
    bank_transfer_sales_kurus,
    technical_service_revenue_kurus,
    credit_payments_collected_kurus,
    product_sales_cost_kurus,
    technical_service_direct_cost_kurus,
    ts_cost_paid_from_cash_kurus,
    ts_cost_unpaid_kurus,
    unrefunded_cancelled_ts_cost_kurus,
    cancelled_unpaid_ts_cost_kurus,
    cancelled_ts_loss_kurus,
    general_operating_expenses_kurus,
    salary_expenses_kurus: safe_salary_expenses,
    total_costs_and_expenses_kurus: product_sales_cost_kurus + technical_service_direct_cost_kurus + cancelled_ts_loss_kurus + general_operating_expenses_kurus + (safe_salary_expenses || 0),
    monthly_credit_sales_kurus,
    monthly_credit_collected_kurus: credit_payments_collected_kurus,
    total_open_credit_balance_kurus,
    overdue_credit_balance_kurus,
    capital_injected_kurus,
    owner_withdrawn_kurus,
    bank_deposits_kurus,
    end_of_month_cash_kurus,
    gross_profit_kurus,
    net_profit_kurus: safe_net_profit,
    missing_cost_sales_count,
    missing_cost_warning: missing_cost_sales_count > 0,
  };
}

export async function getDailyExpenseCategorySummary(
  kasaDayId: string,
  actorRole: KasaUserRole
): Promise<KasaExpenseCategorySummary[]> {
  const supabase = getSupabaseAdmin();

  const { data: categories } = await supabase
    .from('kasa_expense_categories')
    .select('id, name, is_salary_category, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const { data: expenses } = await supabase
    .from('kasa_expenses')
    .select('id, expense_category_id, amount_kurus, status, payment_method')
    .eq('kasa_day_id', kasaDayId);

  const expMap = new Map<string, { count: number; active: number; cancelled: number; cash: number; bank: number }>();

  for (const e of expenses || []) {
    const catId = e.expense_category_id;
    const cur = expMap.get(catId) || { count: 0, active: 0, cancelled: 0, cash: 0, bank: 0 };
    const amt = Number(e.amount_kurus || 0);

    if (e.status === 'cancelled') {
      cur.cancelled += amt;
    } else {
      cur.count += 1;
      cur.active += amt;
      if (e.payment_method === 'bank') cur.bank += amt;
      else cur.cash += amt;
    }
    expMap.set(catId, cur);
  }

  const result: KasaExpenseCategorySummary[] = [];

  for (const cat of categories || []) {
    if (actorRole === 'personel' && cat.is_salary_category) {
      continue;
    }

    const st = expMap.get(cat.id) || { count: 0, active: 0, cancelled: 0, cash: 0, bank: 0 };
    result.push({
      category_id: cat.id,
      category_name: cat.name,
      is_salary_category: cat.is_salary_category,
      count: st.count,
      active_total_kurus: st.active,
      cancelled_total_kurus: st.cancelled,
      net_total_kurus: st.active,
      cash_total_kurus: st.cash,
      bank_total_kurus: st.bank,
    });
  }

  return result;
}

export interface TSDirectCostItem {
  id: string;
  receipt_no: string;
  customer_name: string;
  product_name: string;
  service_cost_kurus: number;
  service_cost_payment_status: string;
  paid_from_cash_kurus: number;
  unpaid_kurus: number;
  stock_kurus: number;
  status: string;
}

export async function getDailyTSDirectCosts(kasaDayId: string): Promise<{
  items: TSDirectCostItem[];
  subtotals: {
    total_ts_cost_kurus: number;
    paid_from_cash_ts_cost_kurus: number;
    unpaid_ts_cost_kurus: number;
    stock_ts_cost_kurus: number;
  };
}> {
  const supabase = getSupabaseAdmin();
  const { data: sales } = await supabase
    .from('kasa_sales')
    .select(`
      id, receipt_no, customer_name, product_name, service_cost_kurus, service_cost_payment_status, status,
      category:kasa_categories(name)
    `)
    .eq('kasa_day_id', kasaDayId)
    .eq('status', 'completed');

  const tsSales = (sales || []).filter((s) => {
    const catObj: any = Array.isArray(s.category) ? s.category[0] : s.category;
    return catObj?.name === 'Teknik Servis';
  });

  let totalCost = 0;
  let paidCashCost = 0;
  let unpaidCost = 0;
  let stockCost = 0;

  const items: TSDirectCostItem[] = tsSales.map((s) => {
    const cost = Number(s.service_cost_kurus || 0);
    const st = s.service_cost_payment_status || null;
    const paidCash = st === 'paid_from_cash' ? cost : 0;
    const unpaid = st === 'unpaid' ? cost : 0;
    const stock = (st === 'used_from_stock' || st === 'previously_paid' || st === 'previously_paid_or_stock' || st === 'legacy_unspecified') ? cost : 0;

    totalCost += cost;
    paidCashCost += paidCash;
    unpaidCost += unpaid;
    stockCost += stock;

    return {
      id: s.id,
      receipt_no: s.receipt_no || '-',
      customer_name: s.customer_name || 'Müşteri Belirtilmemiş',
      product_name: s.product_name,
      service_cost_kurus: cost,
      service_cost_payment_status: st,
      paid_from_cash_kurus: paidCash,
      unpaid_kurus: unpaid,
      stock_kurus: stock,
      status: s.status,
    };
  });

  return {
    items,
    subtotals: {
      total_ts_cost_kurus: totalCost,
      paid_from_cash_ts_cost_kurus: paidCashCost,
      unpaid_ts_cost_kurus: unpaidCost,
      stock_ts_cost_kurus: stockCost,
    },
  };
}

export interface KasaUnifiedMovementsResponse {
  items: KasaUnifiedMovement[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export async function getUnifiedDailyMovements(params: {
  kasaDayId?: string;
  startDate?: string;
  endDate?: string;
  movementType?: string;
  direction?: 'all' | 'in' | 'out' | 'non_cash';
  page?: number;
  pageSize?: number;
  actorRole?: KasaUserRole;
}): Promise<KasaUnifiedMovementsResponse> {
  const supabase = getSupabaseAdmin();

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('kasa_movements')
    .select(`
      id, kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus,
      card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id, created_at,
      kasa_days!inner(date_val, status),
      created_by:kasa_users(full_name),
      sale:kasa_sales(receipt_no, status, created_by_user_id, credit_customer_id, credit_paid_kurus, usd_tl_equivalent_kurus, eur_tl_equivalent_kurus, customer_name, serial_imei, category:kasa_categories(name))
    `, { count: 'exact' });

  if (params.kasaDayId) {
    query = query.eq('kasa_day_id', params.kasaDayId);
  }

  if (params.startDate) {
    query = query.gte('kasa_days.date_val', params.startDate);
  }

  if (params.endDate) {
    query = query.lte('kasa_days.date_val', params.endDate);
  }

  if (params.movementType) {
    query = query.eq('movement_type', params.movementType);
  }

  if (params.direction === 'in') {
    query = query.gt('cash_portion_kurus', 0);
  } else if (params.direction === 'out') {
    query = query.lt('cash_portion_kurus', 0);
  } else if (params.direction === 'non_cash') {
    query = query.or('card_portion_kurus.gt.0,bank_transfer_portion_kurus.gt.0');
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data: movements, count, error } = await query;
  if (error) {
    console.error('getUnifiedDailyMovements DB Error:', error);
    throw new Error(`Hareket defteri verileri okunamadı: ${error.message}`);
  }

  const items: KasaUnifiedMovement[] = [];

  const labelMap: Record<string, string> = {
    satis: 'Satış',
    nakit_tahsilat: 'Nakit Tahsilat',
    kredi_karti_tahsilat: 'Kredi Kartı Tahsilat',
    bank_transfer_tahsilat: 'Havale / EFT Tahsilat',
    nakit_gider: 'Nakit Gider',
    salary_payment: 'Personel Maaş Ödemesi',
    iade: 'Satış İadesi',
    iptal: 'Satış İptali',
    acilis_bakiyesi: 'Önceki Gün Devri / Açılış',
    gun_sonu_kapanis: 'Gün Sonu Kapanış Sayımı',
    capital_injection: 'Sermaye Girişi',
    owner_withdrawal: 'İşletme Sahibi Çekimi',
    bank_deposit: 'Bankaya Yatırılan Nakit',
    fx_sale_payment: 'Dövizli Satış Tahsilatı',
    fx_conversion_to_try: 'Döviz Bozdurma (TL Kasa Girişi)',
    credit_tahsilat: 'Cari Tahsilat',
    satis_duzeltme_iptal: 'Satış Düzeltme İptal Kaydı',
    satis_duzeltme_yeni: 'Satış Düzeltme Yeni Kayıt',
    gider_duzeltme_iptal: 'Gider Düzeltme İptal Kaydı',
    gider_duzeltme_yeni: 'Gider Düzeltme Yeni Kayıt',
    gider_iptal: 'Gider İptali',
    ts_cost_cash_payment: 'Teknik Servis Nakit Maliyet Ödemesi',
    ts_cost_cash_refund: 'Teknik Servis Maliyet İadesi Kasaya Giriş',
    carryover_repair: 'Devir Onarımı Kaydı',
  };

  for (const m of movements || []) {
    const isSalary = m.movement_type === 'salary_payment';
    if (params.actorRole === 'personel' && isSalary) {
      continue;
    }

    const cashPortion = Number(m.cash_portion_kurus || 0);
    const cardPortion = Number(m.card_portion_kurus || 0);
    const bankTransferPortion = Number(m.bank_transfer_portion_kurus || 0);

    let cash_in_kurus = 0;
    let cash_out_kurus = 0;

    if (cashPortion > 0) {
      cash_in_kurus = cashPortion;
    } else if (cashPortion < 0) {
      cash_out_kurus = Math.abs(cashPortion);
    }

    const movement_label = labelMap[m.movement_type] || m.movement_type;
    const date_val = (m.kasa_days as any)?.date_val || new Date(m.created_at).toISOString().split('T')[0];
    const kasaDayStatus = (m.kasa_days as any)?.status || 'closed';
    const created_by_name = (m.created_by as any)?.full_name || 'Sistem';
    const saleObj = (m.sale as any);
    const receipt_no = saleObj?.receipt_no || undefined;
    const saleCategoryObj: any = Array.isArray(saleObj?.category) ? saleObj?.category[0] : saleObj?.category;
    const category_name = saleCategoryObj?.name || undefined;

    items.push({
      id: m.id,
      kasa_day_id: m.kasa_day_id,
      kasa_day_status: kasaDayStatus,
      date_val,
      movement_type: m.movement_type,
      movement_label,
      sale_id: m.sale_id || undefined,
      sale_status: saleObj?.status || undefined,
      sale_created_by_user_id: saleObj?.created_by_user_id || undefined,
      category_name,
      description: m.description,
      cash_in_kurus,
      cash_out_kurus,
      card_portion_kurus: cardPortion,
      bank_transfer_portion_kurus: bankTransferPortion,
      credit_amount_kurus: Number(saleObj?.credit_paid_kurus || 0),
      usd_tl_equivalent_kurus: Number(saleObj?.usd_tl_equivalent_kurus || 0),
      eur_tl_equivalent_kurus: Number(saleObj?.eur_tl_equivalent_kurus || 0),
      customer_name: saleObj?.customer_name || undefined,
      serial_imei: saleObj?.serial_imei || undefined,
      created_by_user_id: m.created_by_user_id,
      created_by_name,
      created_at: m.created_at,
      receipt_no,
    });
  }

  const total = count || 0;
  const total_pages = Math.ceil(total / pageSize);

  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages,
  };
}

export async function repairDayCarryover(
  actorUserId: string,
  targetDayId: string,
  sourceDayId: string,
  justification: string
): Promise<KasaDay> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_repair_day_carryover', {
    p_actor_user_id: actorUserId,
    p_target_day_id: targetDayId,
    p_source_day_id: sourceDayId,
    p_justification: justification,
  });

  if (error || !data) {
    throw new Error(`Devir onarımı başarısız: ${error?.message}`);
  }

  return data as KasaDay;
}

export async function calculatePhysicalCashForDay(kasaDayId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data: day } = await supabase.from('kasa_days').select('*').eq('id', kasaDayId).single();
  if (!day) return 0;

  const opening = Number(day.opening_balance_kurus || 0);
  const capital = Number(day.capital_injected_kurus || 0);
  const withdrawn = Number(day.owner_withdrawn_kurus || 0);

  const { data: sales } = await supabase.from('kasa_sales').select('cash_paid_kurus').eq('kasa_day_id', kasaDayId).eq('status', 'completed');
  const cashSales = (sales || []).reduce((sum, s) => sum + Number(s.cash_paid_kurus || 0), 0);

  const { data: expenses } = await supabase.from('kasa_expenses').select('amount_kurus').eq('kasa_day_id', kasaDayId).neq('status', 'cancelled').eq('payment_method', 'cash');
  const cashExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount_kurus || 0), 0);

  const { data: creditPayments } = await supabase.from('kasa_credit_payments').select('cash_paid_kurus').eq('kasa_day_id', kasaDayId);
  const cashCreditColls = (creditPayments || []).reduce((sum, c) => sum + Number(c.cash_paid_kurus || 0), 0);

  const { data: bankDepositsData } = await supabase.from('kasa_bank_deposits').select('amount_kurus').eq('kasa_day_id', kasaDayId);
  const bankDepositsTotal = (bankDepositsData || []).reduce((sum, b) => sum + Number(b.amount_kurus || 0), 0);

  const { data: fxTrans } = await supabase.from('kasa_fx_transactions').select('tl_equivalent_kurus').eq('kasa_day_id', kasaDayId).eq('transaction_type', 'fx_conversion_to_try');
  const fxTry = (fxTrans || []).reduce((sum, f) => sum + Number(f.tl_equivalent_kurus || 0), 0);

  const { data: tsMovements } = await supabase.from('kasa_movements').select('cash_portion_kurus, movement_type').eq('kasa_day_id', kasaDayId).in('movement_type', ['ts_cost_cash_payment', 'ts_cost_cash_refund']);
  const tsNetCash = (tsMovements || []).reduce((sum, m) => sum + Number(m.cash_portion_kurus || 0), 0);

  return opening + capital - withdrawn + cashSales + cashCreditColls + fxTry + tsNetCash - cashExpenses - bankDepositsTotal;
}

export async function getDashboardCarryoverInfo(todayDay: KasaDay): Promise<DashboardCarryoverInfo> {
  const supabase = getSupabaseAdmin();
  const todayDayId = todayDay.id;

  // Today's Net Cash Movements
  const { data: salesToday } = await supabase
    .from('kasa_sales')
    .select('cash_paid_kurus, service_cost_kurus, service_cost_payment_status')
    .eq('kasa_day_id', todayDayId)
    .eq('status', 'completed');

  const today_cash_sales_kurus = (salesToday || []).reduce((sum, s) => sum + Number(s.cash_paid_kurus || 0), 0);
  const today_ts_cash_costs_kurus = (salesToday || []).reduce((sum, s) => {
    if (s.service_cost_payment_status === 'paid_from_cash') {
      return sum + Number(s.service_cost_kurus || 0);
    }
    return sum;
  }, 0);

  const { data: expToday } = await supabase
    .from('kasa_expenses')
    .select('amount_kurus')
    .eq('kasa_day_id', todayDayId)
    .neq('status', 'cancelled')
    .eq('payment_method', 'cash');

  const today_active_expenses_kurus = (expToday || []).reduce((sum, e) => sum + Number(e.amount_kurus || 0), 0);

  const { data: credToday } = await supabase
    .from('kasa_credit_payments')
    .select('cash_paid_kurus')
    .eq('kasa_day_id', todayDayId);

  const today_cash_credit_collections_kurus = (credToday || []).reduce((sum, c) => sum + Number(c.cash_paid_kurus || 0), 0);

  const { data: bankToday } = await supabase
    .from('kasa_bank_deposits')
    .select('amount_kurus')
    .eq('kasa_day_id', todayDayId);

  const today_bank_deposits_kurus = (bankToday || []).reduce((sum, b) => sum + Number(b.amount_kurus || 0), 0);

  const { data: fxToday } = await supabase
    .from('kasa_fx_transactions')
    .select('tl_equivalent_kurus')
    .eq('kasa_day_id', todayDayId)
    .eq('transaction_type', 'fx_conversion_to_try');

  const today_fx_try_kurus = (fxToday || []).reduce((sum, f) => sum + Number(f.tl_equivalent_kurus || 0), 0);

  const { data: tsMovToday } = await supabase
    .from('kasa_movements')
    .select('cash_portion_kurus')
    .eq('kasa_day_id', todayDayId)
    .in('movement_type', ['ts_cost_cash_payment', 'ts_cost_cash_refund']);

  const today_ts_net_movement_cash = (tsMovToday || []).reduce((sum, m) => sum + Number(m.cash_portion_kurus || 0), 0);

  const today_capital_injected_kurus = Number(todayDay.capital_injected_kurus || 0);
  const today_owner_withdrawn_kurus = Number(todayDay.owner_withdrawn_kurus || 0);

  const today_net_cash_kurus =
    today_capital_injected_kurus -
    today_owner_withdrawn_kurus +
    today_cash_sales_kurus +
    today_cash_credit_collections_kurus +
    today_fx_try_kurus +
    today_ts_net_movement_cash -
    today_active_expenses_kurus -
    today_ts_cash_costs_kurus -
    today_bank_deposits_kurus;

  // Kendisinden eski en yakın kasa gününü bul (status bağımsız)
  const { data: prevDays } = await supabase
    .from('kasa_days')
    .select('*')
    .lt('date_val', todayDay.date_val)
    .order('date_val', { ascending: false })
    .limit(1);

  const prevDay = prevDays && prevDays.length > 0 ? prevDays[0] : null;

  const baseBreakdown = {
    today_net_cash_kurus,
    today_cash_sales_kurus,
    today_cash_credit_collections_kurus,
    today_active_expenses_kurus,
    today_ts_cash_costs_kurus,
    today_bank_deposits_kurus,
    today_owner_withdrawn_kurus,
    today_capital_injected_kurus,
  };

  if (!prevDay) {
    const opening = Number(todayDay.opening_balance_kurus || 0);
    const confirmedCash = opening + today_net_cash_kurus;
    return {
      opening_balance_kurus: opening,
      displayed_carryover_kurus: opening,
      displayed_expected_cash_kurus: confirmedCash,
      confirmed_physical_cash_kurus: confirmedCash,
      ...baseBreakdown,
      carryover_status: 'first_day',
      carryover_source_day_id: null,
      carryover_source_date: null,
      carryover_block_reason: null,
    };
  }

  // Önceki gün açık mı?
  if (prevDay.status === 'open') {
    const prevDayCash = await calculatePhysicalCashForDay(prevDay.id);
    const opening = Number(todayDay.opening_balance_kurus || 0);
    const confirmedCash = opening + today_net_cash_kurus;
    const displayedExpected = prevDayCash + today_net_cash_kurus;

    return {
      opening_balance_kurus: opening,
      displayed_carryover_kurus: prevDayCash,
      displayed_expected_cash_kurus: displayedExpected,
      confirmed_physical_cash_kurus: confirmedCash,
      ...baseBreakdown,
      carryover_status: 'pending_previous_close',
      carryover_source_day_id: prevDay.id,
      carryover_source_date: prevDay.date_val,
      carryover_block_reason: `${prevDay.date_val} tarihli önceki kasa gününün gün sonu kapatılması bekleniyor.`,
    };
  }

  // Önceki gün kapalı
  const prevCounted = Number(prevDay.counted_cash_kurus || 0);
  const targetOpening = Number(todayDay.opening_balance_kurus || 0);
  const confirmedCash = targetOpening + today_net_cash_kurus;

  if (targetOpening === prevCounted) {
    return {
      opening_balance_kurus: targetOpening,
      displayed_carryover_kurus: targetOpening,
      displayed_expected_cash_kurus: confirmedCash,
      confirmed_physical_cash_kurus: confirmedCash,
      ...baseBreakdown,
      carryover_status: 'confirmed',
      carryover_source_day_id: prevDay.id,
      carryover_source_date: prevDay.date_val,
      carryover_block_reason: null,
    };
  }

  return {
    opening_balance_kurus: targetOpening,
    displayed_carryover_kurus: prevCounted,
    displayed_expected_cash_kurus: prevCounted + today_net_cash_kurus,
    confirmed_physical_cash_kurus: confirmedCash,
    ...baseBreakdown,
    carryover_status: 'repair_required',
    carryover_source_day_id: prevDay.id,
    carryover_source_date: prevDay.date_val,
    carryover_block_reason: 'Açılış bakiyesi ile önceki gün kapanış sayımı uyuşmuyor. Devir onarımı gereklidir.',
  };
}

export async function getMonthToDateCollections() {
  const supabase = getSupabaseAdmin();
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const startDateStr = `${year}-${month}-01`;
  const endDateStr = `${year}-${month}-${day}`;
  const startISO = `${startDateStr}T00:00:00.000Z`;
  const endISO = `${endDateStr}T23:59:59.999Z`;

  const { data: sales } = await supabase
    .from('kasa_sales')
    .select('cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, status')
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .eq('status', 'completed');

  let cashSalesMinor = 0;
  let cardSalesMinor = 0;
  let bankTransferSalesMinor = 0;

  (sales || []).forEach((s) => {
    cashSalesMinor += Number(s.cash_paid_kurus || 0);
    cardSalesMinor += Number(s.card_paid_kurus || 0);
    bankTransferSalesMinor += Number(s.bank_transfer_paid_kurus || 0);
  });

  const { data: creditPayments } = await supabase
    .from('kasa_credit_payments')
    .select('cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  let creditCashMinor = 0;
  let creditCardMinor = 0;
  let creditBankMinor = 0;

  (creditPayments || []).forEach((cp) => {
    creditCashMinor += Number(cp.cash_paid_kurus || 0);
    creditCardMinor += Number(cp.card_paid_kurus || 0);
    creditBankMinor += Number(cp.bank_transfer_paid_kurus || 0);
  });

  const netCashMinor = cashSalesMinor + creditCashMinor;
  const netCardMinor = cardSalesMinor + creditCardMinor;
  const netBankTransferMinor = bankTransferSalesMinor + creditBankMinor;
  const netCreditMinor = creditCashMinor + creditCardMinor + creditBankMinor;
  const netCollectionsMinor = netCashMinor + netCardMinor + netBankTransferMinor;

  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const periodLabel = `1–${today.getDate()} ${monthNames[today.getMonth()]} ${year}`;

  return {
    period_label: periodLabel,
    start_date: startDateStr,
    end_date: endDateStr,
    cash_sales_collections_minor: cashSalesMinor,
    card_sales_collections_minor: cardSalesMinor,
    bank_transfer_sales_collections_minor: bankTransferSalesMinor,
    credit_collections_by_cash_minor: creditCashMinor,
    credit_collections_by_card_minor: creditCardMinor,
    credit_collections_by_bank_minor: creditBankMinor,
    refunds_by_channel_minor: 0,
    net_cash_collections_minor: netCashMinor,
    net_card_collections_minor: netCardMinor,
    net_bank_transfer_collections_minor: netBankTransferMinor,
    net_credit_collections_minor: netCreditMinor,
    net_collections_minor: netCollectionsMinor,
  };
}
