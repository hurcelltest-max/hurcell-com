import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from './crypto';
import { calculateOverdueDays, calculatePrudentResult } from './math';
import { getTCMBExchangeRates } from './tcmb';
import {
  KasaBankDeposit,
  KasaCategory,
  KasaCategorySummary,
  KasaCreditCustomer,
  KasaCreditPayment,
  KasaDashboardMetrics,
  KasaDay,
  KasaExpense,
  KasaExpenseCategory,
  KasaFXTransaction,
  KasaSale,
  KasaSettings,
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
      cash_reserve_target_kurus: 2000000,
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

export async function getOrCreateTodayDay(actorUserId: string): Promise<KasaDay> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_get_or_create_open_day', {
    p_actor_user_id: actorUserId,
  });

  if (error || !data) {
    throw new Error(`Kasa günü alınamadı: ${error?.message}`);
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
      amount_kurus, sale_id,
      category:kasa_expense_categories(name, is_salary_category)
    `)
    .eq('kasa_day_id', dayId);

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

    const categoryName = (s.category as any)?.name;

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
  let salaryExpenses = 0;
  let technicalServiceExpenseFromExpenses = 0;

  for (const e of expenses || []) {
    const amt = Number(e.amount_kurus || 0);
    expensesTotal += amt;
    const catName = (e.category as any)?.name;
    const isSalary = (e.category as any)?.is_salary_category;

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

  const expectedCash = openingBalance + capitalInjected - ownerWithdrawn + cashCollection + fxConversionsTRYTotal - expensesTotal - cashReturnsTotal - bankDepositsTotal;

  const usdBalanceCents = Number(day?.usd_balance_cents || 0);
  const eurBalanceCents = Number(day?.eur_balance_cents || 0);

  const usdTLEquivalentKurus = Math.round((usdBalanceCents / 100.0) * fxRates.usdRate * 100);
  const eurTLEquivalentKurus = Math.round((eurBalanceCents / 100.0) * fxRates.eurRate * 100);
  const totalFxTLEquivalentKurus = usdTLEquivalentKurus + eurTLEquivalentKurus;
  const totalAssetTRYEquivalentKurus = expectedCash + totalFxTLEquivalentKurus;

  const cashReserveTarget = Number(settings.cash_reserve_target_kurus || 2000000);
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
    expenses_total_kurus: expensesTotal,
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

  const { data, error } = await supabase.rpc('fn_kasa_create_sale', {
    p_actor_user_id: actorUserId,
    p_kasa_day_id: day.id,
    p_category_id: input.category_id,
    p_product_name: input.product_name,
    p_quantity: input.quantity,
    p_unit_price_kurus: input.unit_price_kurus,
    p_cost_price_kurus: input.cost_price_kurus || 0,
    p_cash_paid_kurus: input.cash_paid_kurus || 0,
    p_card_paid_kurus: input.card_paid_kurus || 0,
    p_usd_paid_cents: input.usd_paid_cents || 0,
    p_usd_rate: input.usd_rate || null,
    p_usd_tl_equivalent_kurus: input.usd_tl_equivalent_kurus || 0,
    p_eur_paid_cents: input.eur_paid_cents || 0,
    p_eur_rate: input.eur_rate || null,
    p_eur_tl_equivalent_kurus: input.eur_tl_equivalent_kurus || 0,
    p_credit_paid_kurus: creditPaidKurus,
    p_credit_customer_id: input.credit_customer_id || null,
    p_brand: input.brand || null,
    p_model: input.model || null,
    p_product_code: input.product_code || null,
    p_description: input.description || null,
    p_idempotency_key: input.idempotency_key || null,
    p_bank_transfer_paid_kurus: input.bank_transfer_paid_kurus || 0,
    p_bank_transfer_reference: input.bank_transfer_reference || null,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Satış kaydı oluşturulamadı.');
  }

  return data as KasaSale;
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
      user:kasa_users(full_name)
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
  justification: string
): Promise<KasaSale> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('fn_kasa_cancel_sale', {
    p_actor_user_id: actorUserId,
    p_sale_id: saleId,
    p_justification: justification,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Satış iptal edilemedi.');
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
  saleId?: string
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
  });

  if (error || !data) {
    throw new Error(error?.message || 'Gider kaydı eklenemedi.');
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
    })) as KasaExpense[];
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
