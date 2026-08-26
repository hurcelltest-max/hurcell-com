export type KasaUserRole = 'yonetici' | 'personel';

export interface KasaSessionPayload {
  userId: string;
  username: string;
  fullName: string;
  role: KasaUserRole;
  exp: number;
}

export interface KasaUser {
  id: string;
  username: string;
  full_name: string;
  role: KasaUserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardCarryoverInfo {
  opening_balance_kurus: number;
  displayed_carryover_kurus: number;
  displayed_expected_cash_kurus: number;
  confirmed_physical_cash_kurus: number;
  today_net_cash_kurus: number;
  today_cash_sales_kurus: number;
  today_cash_credit_collections_kurus: number;
  today_active_expenses_kurus: number;
  today_ts_cash_costs_kurus: number;
  today_bank_deposits_kurus: number;
  today_owner_withdrawn_kurus: number;
  today_capital_injected_kurus: number;
  carryover_status: 'confirmed' | 'pending_previous_close' | 'repair_required' | 'first_day';
  carryover_source_day_id: string | null;
  carryover_source_date: string | null;
  carryover_block_reason: string | null;
}

export interface KasaSettings {
  id: string;
  cash_reserve_target_kurus: number;
  updated_by_user_id?: string;
  updated_at: string;
}

export interface KasaExchangeRate {
  id: string;
  currency_code: 'USD' | 'EUR';
  rate_numeric: number;
  rate_source: string;
  rate_as_of: string;
  created_by_user_id?: string;
  created_at: string;
}

export interface KasaFXRatesResponse {
  usdRate: number;
  eurRate: number;
  source: string;
  asOf: string;
  isFallback: boolean;
}

export interface KasaCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface KasaExpenseCategory {
  id: string;
  name: string;
  display_order: number;
  is_salary_category: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TechnicalServiceDetails {
  customer_name?: string;
  customer_phone?: string;
  device_brand_model?: string;
  serial_imei?: string;
  fault_description?: string;
  parts_cost_kurus?: number;
  labor_cost_kurus?: number;
}

export interface KasaSale {
  id: string;
  receipt_no: string;
  kasa_day_id: string;
  category_id: string;
  category_name?: string;
  product_name: string;
  brand?: string;
  model?: string;
  product_code?: string;
  quantity: number;
  unit_price_kurus: number;
  total_price_kurus: number;
  cost_price_kurus?: number;
  service_cost_kurus?: number;
  service_cost_payment_status?: 'paid_from_cash' | 'previously_paid_or_stock' | 'unpaid' | 'no_cost' | 'legacy_unspecified';
  service_cost_paid_at?: string;
  service_cost_paid_by_user_id?: string;
  cost_refunded_on_cancel?: boolean;
  cash_paid_kurus: number;
  card_paid_kurus: number;
  bank_transfer_paid_kurus: number;
  bank_transfer_reference?: string;
  usd_paid_cents: number;
  usd_rate?: number;
  usd_tl_equivalent_kurus: number;
  eur_paid_cents: number;
  eur_rate?: number;
  eur_tl_equivalent_kurus: number;
  credit_customer_id?: string;
  credit_account_id?: string;
  credit_customer_name?: string;
  credit_paid_kurus: number;
  uncollected_credit_kurus: number;
  uncollected_cost_kurus: number;
  description?: string;
  customer_name?: string;
  customer_phone?: string;
  serial_imei?: string;
  technical_service_details?: TechnicalServiceDetails;
  status: 'completed' | 'returned' | 'cancelled';
  created_by_user_id: string;
  created_by_name?: string;
  idempotency_key?: string;
  created_at: string;
  overdue_days?: number;
  is_overdue?: boolean;
}

export interface KasaFXTransaction {
  id: string;
  kasa_day_id: string;
  transaction_type: 'fx_sale_payment' | 'fx_capital_injection' | 'fx_conversion_to_try' | 'fx_bank_deposit' | 'fx_return' | 'fx_cancellation';
  currency_code: 'USD' | 'EUR';
  foreign_amount_cents: number;
  exchange_rate: number;
  tl_equivalent_kurus: number;
  realized_fx_diff_kurus: number;
  sale_id?: string;
  description?: string;
  created_by_user_id: string;
  idempotency_key?: string;
  created_at: string;
}

export interface KasaBankDeposit {
  id: string;
  kasa_day_id: string;
  amount_kurus: number;
  bank_name?: string;
  reference_no?: string;
  description?: string;
  created_by_user_id: string;
  created_by_name?: string;
  idempotency_key?: string;
  created_at: string;
}

export interface KasaExpense {
  id: string;
  kasa_day_id: string;
  expense_category_id: string;
  category_name?: string;
  sale_id?: string;
  amount_kurus: number;
  description: string;
  recipient_name?: string;
  status?: 'active' | 'cancelled';
  cancelled_at?: string;
  cancelled_by_user_id?: string;
  cancel_reason?: string;
  created_by_user_id: string;
  created_by_name?: string;
  created_at: string;
}

export interface KasaCreditCustomer {
  id: string;
  full_name: string;
  phone: string;
  phone_normalized: string;
  tc_identity_number?: string;
  status: 'active' | 'suspended' | 'blacklisted';
  credit_account_id?: string;
  credit_limit_tl: number;
  current_balance_tl: number;
  available_limit_tl: number;
  is_approved: boolean;
  open_sales_count?: number;
  oldest_open_sale_date?: string;
  max_overdue_days?: number;
  is_overdue?: boolean;
}

export interface KasaCreditPayment {
  id: string;
  kasa_day_id: string;
  credit_customer_id: string;
  credit_customer_name?: string;
  credit_account_id: string;
  amount_kurus: number;
  payment_method: 'cash' | 'card' | 'bank_transfer' | 'usd' | 'eur';
  cash_paid_kurus: number;
  card_paid_kurus: number;
  bank_transfer_paid_kurus: number;
  bank_transfer_reference?: string;
  usd_paid_cents: number;
  usd_rate?: number;
  usd_tl_equivalent_kurus: number;
  eur_paid_cents: number;
  eur_rate?: number;
  eur_tl_equivalent_kurus: number;
  description?: string;
  created_by_user_id: string;
  created_by_name?: string;
  created_at: string;
}

export interface KasaDay {
  id: string;
  date_val: string;
  status: 'open' | 'closed';
  opening_balance_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  expected_cash_kurus?: number;
  counted_cash_kurus?: number;
  cash_difference_kurus?: number;
  usd_balance_cents: number;
  usd_cost_pool_kurus: number;
  eur_balance_cents: number;
  eur_cost_pool_kurus: number;
  counted_usd_cents?: number;
  counted_eur_cents?: number;
  usd_difference_cents?: number;
  eur_difference_cents?: number;
  opened_at: string;
  opened_by_user_id?: string;
  closed_at?: string;
  closed_by_user_id?: string;
  closing_note?: string;
  created_at: string;
  overdue_days_threshold?: number;
  can_close?: boolean;
  close_block_reason?: string | null;
  calculated_physical_cash_kurus?: number;
}

export interface KasaCategorySummary {
  category_id: string;
  category_name: string;
  count: number;
  cash_total_kurus: number;
  card_total_kurus: number;
  bank_transfer_total_kurus?: number;
  credit_total_kurus?: number;
  grand_total_kurus: number;
}

export interface KasaDashboardMetrics {
  sales_count: number;
  total_quantity: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  bank_transfer_collection_kurus: number;
  credit_sales_total_kurus: number;
  credit_collections_total_kurus: number;
  gross_sales_kurus: number;
  expenses_total_kurus: number;
  returns_total_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  expected_cash_kurus: number;
  opening_balance_kurus: number;
  salary_expenses_kurus: number;
  technical_service_revenue_kurus: number;
  technical_service_expense_kurus: number;
  missing_cost_warning: boolean;
  estimated_profit_kurus: number;
  realized_net_profit_kurus: number;
  open_credit_total_kurus: number;
  overdue_credit_total_kurus: number;
  overdue_customer_count: number;
  uncollected_credit_risk_kurus: number;
  prudent_financial_result_kurus: number;
  cash_reserve_target_kurus: number;
  excess_cash_to_bank_kurus: number;
  bank_deposits_total_kurus: number;
  reserve_deficit_kurus: number;
  usd_balance_cents: number;
  eur_balance_cents: number;
  usd_rate: number;
  eur_rate: number;
  fx_rate_source: string;
  fx_rate_as_of: string;
  fx_rate_fallback: boolean;
  usd_tl_equivalent_kurus: number;
  eur_tl_equivalent_kurus: number;
  total_fx_tl_equivalent_kurus: number;
  total_asset_try_equivalent_kurus: number;
  realized_fx_diff_total_kurus: number;
}

export interface KasaMonthlyReport {
  month_iso: string; // e.g. '2026-08'
  month_label: string; // e.g. 'Ağustos 2026'
  gross_sales_kurus: number;
  cash_sales_kurus: number;
  card_sales_kurus: number;
  bank_transfer_sales_kurus: number;
  technical_service_revenue_kurus: number;
  credit_payments_collected_kurus: number;
  product_sales_cost_kurus: number;
  technical_service_direct_cost_kurus: number;
  ts_cost_paid_from_cash_kurus: number;
  ts_cost_unpaid_kurus: number;
  unrefunded_cancelled_ts_cost_kurus: number;
  cancelled_unpaid_ts_cost_kurus: number;
  cancelled_ts_loss_kurus: number;
  general_operating_expenses_kurus: number;
  salary_expenses_kurus?: number;
  total_costs_and_expenses_kurus: number;
  monthly_credit_sales_kurus: number;
  monthly_credit_collected_kurus: number;
  total_open_credit_balance_kurus: number;
  overdue_credit_balance_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  bank_deposits_kurus: number;
  end_of_month_cash_kurus: number;
  gross_profit_kurus: number;
  net_profit_kurus: number;
  missing_cost_sales_count: number;
  missing_cost_warning: boolean;
}

export interface KasaExpenseCategorySummary {
  category_id: string;
  category_name: string;
  is_salary_category: boolean;
  count: number;
  active_total_kurus: number;
  cancelled_total_kurus: number;
  net_total_kurus: number;
}

export interface KasaUnifiedMovement {
  id: string;
  kasa_day_id: string;
  date_val: string;
  movement_type: string;
  movement_label: string;
  category_name?: string;
  description: string;
  cash_in_kurus: number;
  cash_out_kurus: number;
  card_portion_kurus: number;
  bank_transfer_portion_kurus: number;
  usd_amount_cents?: number;
  eur_amount_cents?: number;
  credit_amount_kurus?: number;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  status?: string;
  ref_id?: string;
  receipt_no?: string;
}
