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
  service_cost_payment_status?: 'paid_from_cash' | 'paid_from_bank' | 'used_from_stock' | 'previously_paid' | 'previously_paid_or_stock' | 'unpaid' | 'no_cost' | 'legacy_unspecified';
  service_cost_payment_source?: 'cash' | 'bank' | 'stock' | 'previously_paid' | 'none' | null;
  service_cost_bank_account_id?: string | null;
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
  payment_method: 'cash' | 'bank';
  bank_account_id?: string | null;
  bank_transaction_id?: string | null;
  bank_account_name?: string;
  idempotency_key?: string;
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
  cash_total_kurus?: number;
  bank_total_kurus?: number;
}

export interface KasaUnifiedMovement {
  id: string;
  kasa_day_id: string;
  kasa_day_status?: 'open' | 'closed';
  date_val: string;
  movement_type: string;
  movement_label: string;
  sale_id?: string;
  sale_status?: 'completed' | 'returned' | 'cancelled';
  sale_created_by_user_id?: string;
  category_name?: string;
  description: string;
  cash_in_kurus: number;
  cash_out_kurus: number;
  card_portion_kurus: number;
  bank_transfer_portion_kurus: number;
  usd_amount_cents?: number;
  usd_tl_equivalent_kurus?: number;
  eur_amount_cents?: number;
  eur_tl_equivalent_kurus?: number;
  credit_amount_kurus?: number;
  customer_name?: string;
  serial_imei?: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  status?: string;
  ref_id?: string;
  receipt_no?: string;
}

export interface KasaBankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_no?: string | null;
  iban?: string | null;
  iban_masked?: string | null;
  currency_code: string;
  opening_balance_kurus: number;
  current_balance_kurus: number;
  formatted_balance?: string;
  is_active: boolean;
  display_order: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KasaBankTransaction {
  id: string;
  bank_account_id: string;
  account_name?: string;
  bank_account_name?: string;
  bank_name?: string;
  transaction_type: 'opening_balance' | 'capital_injection' | 'owner_withdrawal' | 'pos_settlement' | 'bank_expense' | 'ts_cost_payment' | 'bank_transfer_in' | 'bank_transfer_out' | 'bank_to_cash_withdrawal' | 'cash_to_bank_deposit' | 'bank_adjustment';
  direction: 'in' | 'out';
  amount_kurus: number;
  amount_minor?: number;
  formatted_amount?: string;
  transaction_date: string;
  description?: string | null;
  justification?: string | null;
  reference_no?: string | null;
  related_expense_id?: string | null;
  related_sale_id?: string | null;
  related_transfer_id?: string | null;
  status: 'active' | 'cancelled';
  created_by_user_id: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface KasaBankSettings {
  id: string;
  pos_tracking_start_at: string;
  opening_pos_receivable_kurus: number;
  pos_bank_account_id?: string | null;
  updated_at: string;
  updated_by_user_id?: string | null;
}

export interface KasaBalanceSheetReport {
  as_of_date: string;
  cash_assets_kurus?: number;
  bank_assets_kurus?: number;
  pos_receivables_kurus?: number;
  customer_credit_receivables_kurus?: number;
  inventory_value_kurus?: number;
  total_assets_kurus?: number;
  short_term_liabilities_kurus?: number;
  unpaid_ts_costs_kurus?: number;
  total_liabilities_kurus?: number;
  net_equity_kurus?: number;
  owner_capital_injected_kurus?: number;
  owner_capital_withdrawn_kurus?: number;
  net_retained_earnings_kurus?: number;
  financial_status?: {
    physical_cash_tl: number;
    usd_cash_cents: number;
    eur_cash_cents: number;
    bank_balances_try: number;
    pending_pos_receivables_try: number;
    open_credit_receivables_try: number;
    total_liquid_assets_try: number;
    total_financial_assets_try: number;
    unpaid_ts_costs_try: number;
    total_liabilities_try: number;
    net_financial_assets_try: number;
    liabilities_status_note: string;
  };
  income_statement?: {
    month_label: string;
    gross_turnover_tl: number;
    product_sales_cost_tl: number;
    ts_direct_cost_tl: number;
    gross_profit_tl: number;
    general_operating_expenses_tl: number;
    bank_operating_expenses_tl: number;
    salary_expenses_tl: number;
    realized_fx_diff_tl: number;
    net_profit_tl: number;
    missing_cost_sales_count: number;
    missing_cost_warning: boolean;
  };
  reconciliation_table?: Array<{
    channel: string;
    gross_collection_tl: number;
    refunds_tl: number;
    net_collection_tl: number;
    reflected_destination: string;
  }>;
}

export interface KasaMonthToDateCollections {
  month_label?: string;
  period_label?: string;
  start_date: string;
  end_date: string;
  total_sales_tl?: number;
  cash_collections_tl?: number;
  card_collections_tl?: number;
  bank_transfer_collections_tl?: number;
  usd_collections_tl_eq?: number;
  eur_collections_tl_eq?: number;
  credit_collections_tl?: number;
  total_collected_tl?: number;
  uncollected_credit_tl?: number;
  cash_sales_collections_minor?: number;
  card_sales_collections_minor?: number;
  bank_transfer_sales_collections_minor?: number;
  credit_collections_by_cash_minor?: number;
  credit_collections_by_card_minor?: number;
  credit_collections_by_bank_minor?: number;
  refunds_by_channel_minor?: number;
  net_cash_collections_minor?: number;
  net_card_collections_minor?: number;
  net_bank_transfer_collections_minor?: number;
  net_credit_collections_minor?: number;
  net_collections_minor?: number;
}
