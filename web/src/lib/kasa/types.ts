export type KasaUserRole = 'yonetici' | 'personel';

export interface KasaUser {
  id: string;
  username: string;
  full_name: string;
  role: KasaUserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KasaSettings {
  id: string;
  cash_reserve_target_kurus: number;
  updated_by_user_id?: string | null;
  updated_at: string;
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

export interface KasaDay {
  id: string;
  date_val: string;
  status: 'open' | 'closed';
  opening_balance_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  expected_cash_kurus?: number | null;
  counted_cash_kurus?: number | null;
  cash_difference_kurus?: number | null;
  usd_balance_cents: number;
  eur_balance_cents: number;
  opened_at: string;
  opened_by_user_id?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: string | null;
  closing_note?: string | null;
  created_at: string;
}

export interface TechnicalServiceDetails {
  device_type?: string;
  brand?: string;
  model?: string;
  action_taken?: string;
  service_cost_kurus?: number;
}

export interface KasaSale {
  id: string;
  receipt_no: string;
  kasa_day_id: string;
  category_id: string;
  product_name: string;
  brand?: string | null;
  model?: string | null;
  product_code?: string | null;
  quantity: number;
  unit_price_kurus: number;
  total_price_kurus: number;
  cost_price_kurus?: number | null;
  service_cost_kurus?: number | null;
  cash_paid_kurus: number;
  card_paid_kurus: number;
  usd_paid_cents: number;
  usd_rate?: number | null;
  usd_tl_equivalent_kurus: number;
  eur_paid_cents: number;
  eur_rate?: number | null;
  eur_tl_equivalent_kurus: number;
  description?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  serial_imei?: string | null;
  technical_service_details?: TechnicalServiceDetails | null;
  status: 'completed' | 'returned' | 'cancelled';
  created_by_user_id: string;
  idempotency_key?: string | null;
  created_at: string;
  category_name?: string;
  created_by_name?: string;
}

export type MovementType =
  | 'satis'
  | 'nakit_tahsilat'
  | 'kredi_karti_tahsilat'
  | 'nakit_gider'
  | 'iade'
  | 'iptal'
  | 'acilis_bakiyesi'
  | 'gun_sonu_kapanis'
  | 'capital_injection'
  | 'owner_withdrawal'
  | 'cash_carry_forward'
  | 'salary_payment'
  | 'technical_service_revenue'
  | 'technical_service_expense'
  | 'inventory_purchase'
  | 'bank_deposit'
  | 'fx_sale_payment'
  | 'fx_capital_injection'
  | 'fx_conversion_to_try'
  | 'fx_bank_deposit'
  | 'fx_return';

export interface KasaMovement {
  id: string;
  kasa_day_id: string;
  movement_type: MovementType;
  sale_id?: string | null;
  amount_kurus: number;
  cash_portion_kurus: number;
  card_portion_kurus: number;
  description: string;
  justification?: string | null;
  created_by_user_id: string;
  created_at: string;
}

export interface KasaExpense {
  id: string;
  kasa_day_id: string;
  expense_category_id: string;
  sale_id?: string | null;
  amount_kurus: number;
  description: string;
  recipient_name?: string | null;
  created_by_user_id: string;
  created_at: string;
  category_name?: string;
  created_by_name?: string;
}

export interface KasaBankDeposit {
  id: string;
  kasa_day_id: string;
  amount_kurus: number;
  bank_name?: string | null;
  reference_no?: string | null;
  description?: string | null;
  created_by_user_id: string;
  idempotency_key?: string | null;
  created_at: string;
  created_by_name?: string;
}

export interface KasaFXTransaction {
  id: string;
  kasa_day_id: string;
  transaction_type: 'fx_sale_payment' | 'fx_capital_injection' | 'fx_conversion_to_try' | 'fx_bank_deposit' | 'fx_return';
  currency_code: 'USD' | 'EUR';
  foreign_amount_cents: number;
  exchange_rate: number;
  tl_equivalent_kurus: number;
  realized_fx_diff_kurus: number;
  sale_id?: string | null;
  description?: string | null;
  created_by_user_id: string;
  idempotency_key?: string | null;
  created_at: string;
  created_by_name?: string;
}

export interface KasaCategorySummary {
  category_id: string;
  category_name: string;
  count: number;
  cash_total_kurus: number;
  card_total_kurus: number;
  grand_total_kurus: number;
}

export interface KasaDashboardMetrics {
  sales_count: number;
  total_quantity: number;
  cash_collection_kurus: number;
  card_collection_kurus: number;
  gross_sales_kurus: number;
  expenses_total_kurus: number;
  returns_total_kurus: number;
  capital_injected_kurus: number;
  owner_withdrawn_kurus: number;
  expected_cash_kurus: number; // YALNIZCA FİZİKSEL TL NAKİT!
  opening_balance_kurus: number;
  salary_expenses_kurus: number;
  technical_service_revenue_kurus: number;
  technical_service_expense_kurus: number;
  missing_cost_warning: boolean;
  estimated_profit_kurus: number;
  cash_reserve_target_kurus: number;
  excess_cash_to_bank_kurus: number; // YALNIZCA FİZİKSEL TL NAKİT ÜZERİNDEN!
  bank_deposits_total_kurus: number;
  reserve_deficit_kurus: number;
  // USD & EUR Döviz Kasası ve TL Karşılıkları
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
  total_asset_try_equivalent_kurus: number; // Fiziksel TL + Dövizlerin TL Karşılığı
  realized_fx_diff_total_kurus: number; // Bozdurulan dövizlerden gerçekleşen kur farkı
}

export interface KasaSessionPayload {
  userId: string;
  username: string;
  fullName: string;
  role: KasaUserRole;
  exp: number;
}
