-- Migration: 20260823000000_kasa_system_foundation.sql
-- Description: HurCELL Kasa Föyü Temel Tabloları, USD/EUR Döviz Kasaları, FX Maliyet Havuzları ve RLS

BEGIN;

-- 1. PRECONDITION CHECKS (Fail-Fast)
DO $$
BEGIN
  IF to_regclass('public.kasa_users') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_users table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_categories') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_categories table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_expense_categories') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_expense_categories table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_days') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_days table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_sales') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_sales table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_movements') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_movements table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_expenses') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_expenses table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_settings table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_bank_deposits') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_bank_deposits table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_exchange_rates') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_exchange_rates table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_fx_transactions') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_fx_transactions table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_audit_logs') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_audit_logs table already exists; inspect schema before migration';
  END IF;
  IF to_regclass('public.kasa_login_attempts') IS NOT NULL THEN
    RAISE EXCEPTION 'public.kasa_login_attempts table already exists; inspect schema before migration';
  END IF;
END $$;

-- 2. CREATE TABLOLAR

-- Kasa Kullanıcıları ve Rolleri
CREATE TABLE public.kasa_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL CONSTRAINT uq_kasa_users_username UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CONSTRAINT chk_kasa_users_role CHECK (role IN ('yonetici', 'personel')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kasa Ayarları
CREATE TABLE public.kasa_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_reserve_target_kurus BIGINT NOT NULL DEFAULT 2000000 CONSTRAINT chk_kasa_settings_reserve CHECK (cash_reserve_target_kurus >= 0),
    updated_by_user_id UUID REFERENCES public.kasa_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Döviz Kurları Tablosu
CREATE TABLE public.kasa_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code TEXT NOT NULL CONSTRAINT chk_kasa_fx_code CHECK (currency_code IN ('USD', 'EUR')),
    rate_numeric NUMERIC(12, 4) NOT NULL CONSTRAINT chk_kasa_fx_rate CHECK (rate_numeric > 0),
    rate_source TEXT NOT NULL,
    rate_as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_user_id UUID REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kasa Satış Gelir Kategorileri
CREATE TABLE public.kasa_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CONSTRAINT uq_kasa_categories_name UNIQUE,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kasa Gider Kategorileri
CREATE TABLE public.kasa_expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CONSTRAINT uq_kasa_expense_categories_name UNIQUE,
    display_order INT NOT NULL DEFAULT 0,
    is_salary_category BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kasa Günlük Gün Kayıtları (USD/EUR Bakiyeleri ve Maliyet Havuzları Saklanır)
CREATE TABLE public.kasa_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_val DATE NOT NULL CONSTRAINT uq_kasa_days_date_val UNIQUE,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT chk_kasa_days_status CHECK (status IN ('open', 'closed')),
    opening_balance_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_days_opening_balance CHECK (opening_balance_kurus >= 0),
    capital_injected_kurus BIGINT NOT NULL DEFAULT 0,
    owner_withdrawn_kurus BIGINT NOT NULL DEFAULT 0,
    expected_cash_kurus BIGINT,
    counted_cash_kurus BIGINT,
    cash_difference_kurus BIGINT,
    usd_balance_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_days_usd CHECK (usd_balance_cents >= 0),
    usd_cost_pool_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_days_usd_cost CHECK (usd_cost_pool_kurus >= 0),
    eur_balance_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_days_eur CHECK (eur_balance_cents >= 0),
    eur_cost_pool_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_days_eur_cost CHECK (eur_cost_pool_kurus >= 0),
    counted_usd_cents BIGINT,
    counted_eur_cents BIGINT,
    usd_difference_cents BIGINT,
    eur_difference_cents BIGINT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_by_user_id UUID REFERENCES public.kasa_users(id),
    closed_at TIMESTAMPTZ,
    closed_by_user_id UUID REFERENCES public.kasa_users(id),
    closing_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satış Kayıtları
CREATE TABLE public.kasa_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no TEXT NOT NULL CONSTRAINT uq_kasa_sales_receipt_no UNIQUE,
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    category_id UUID NOT NULL REFERENCES public.kasa_categories(id),
    product_name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    product_code TEXT,
    quantity INT NOT NULL CONSTRAINT chk_kasa_sales_quantity CHECK (quantity > 0),
    unit_price_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_sales_unit_price CHECK (unit_price_kurus > 0),
    total_price_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_sales_total_price CHECK (total_price_kurus > 0),
    cost_price_kurus BIGINT,
    service_cost_kurus BIGINT,
    cash_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_cash_paid CHECK (cash_paid_kurus >= 0),
    card_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_card_paid CHECK (card_paid_kurus >= 0),
    usd_paid_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_usd_paid CHECK (usd_paid_cents >= 0),
    usd_rate NUMERIC(12, 4),
    usd_tl_equivalent_kurus BIGINT NOT NULL DEFAULT 0,
    eur_paid_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_eur_paid CHECK (eur_paid_cents >= 0),
    eur_rate NUMERIC(12, 4),
    eur_tl_equivalent_kurus BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    serial_imei TEXT,
    technical_service_details JSONB,
    status TEXT NOT NULL DEFAULT 'completed' CONSTRAINT chk_kasa_sales_status CHECK (status IN ('completed', 'returned', 'cancelled')),
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    idempotency_key TEXT CONSTRAINT uq_kasa_sales_idempotency UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_kasa_sales_price_math CHECK (total_price_kurus = (quantity * unit_price_kurus)),
    CONSTRAINT chk_kasa_sales_payment_math CHECK (total_price_kurus = (cash_paid_kurus + card_paid_kurus + usd_tl_equivalent_kurus + eur_tl_equivalent_kurus))
);

-- Kasa Hareketleri Logu
CREATE TABLE public.kasa_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    movement_type TEXT NOT NULL CONSTRAINT chk_kasa_movements_type CHECK (movement_type IN (
        'satis', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'nakit_gider', 'iade', 'iptal', 'acilis_bakiyesi', 'gun_sonu_kapanis',
        'capital_injection', 'owner_withdrawal', 'cash_carry_forward', 'salary_payment', 'technical_service_revenue',
        'technical_service_expense', 'inventory_purchase', 'bank_deposit', 'fx_sale_payment', 'fx_capital_injection',
        'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return'
    )),
    sale_id UUID REFERENCES public.kasa_sales(id),
    amount_kurus BIGINT NOT NULL,
    cash_portion_kurus BIGINT NOT NULL DEFAULT 0,
    card_portion_kurus BIGINT NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    justification TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Döviz Hareketleri Detay Tablosu
CREATE TABLE public.kasa_fx_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    transaction_type TEXT NOT NULL CONSTRAINT chk_kasa_fx_trans_type CHECK (transaction_type IN (
        'fx_sale_payment', 'fx_capital_injection', 'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return', 'fx_cancellation'
    )),
    currency_code TEXT NOT NULL CONSTRAINT chk_kasa_fx_trans_code CHECK (currency_code IN ('USD', 'EUR')),
    foreign_amount_cents BIGINT NOT NULL,
    exchange_rate NUMERIC(12, 4) NOT NULL,
    tl_equivalent_kurus BIGINT NOT NULL,
    realized_fx_diff_kurus BIGINT NOT NULL DEFAULT 0,
    sale_id UUID REFERENCES public.kasa_sales(id),
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    idempotency_key TEXT CONSTRAINT uq_kasa_fx_trans_idempotency UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kasa Gider Kayıtları
CREATE TABLE public.kasa_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    expense_category_id UUID NOT NULL REFERENCES public.kasa_expense_categories(id),
    sale_id UUID REFERENCES public.kasa_sales(id),
    amount_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_expenses_amount CHECK (amount_kurus > 0),
    description TEXT NOT NULL,
    recipient_name TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bankaya Yatırılan Nakit Kayıtları
CREATE TABLE public.kasa_bank_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    amount_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_bank_deposits_amount CHECK (amount_kurus > 0),
    bank_name TEXT,
    reference_no TEXT,
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    idempotency_key TEXT CONSTRAINT uq_kasa_bank_deposits_idempotency UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kalıcı Rate-Limit Tablosu
CREATE TABLE public.kasa_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash TEXT NOT NULL,
    username TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_success BOOLEAN NOT NULL DEFAULT false
);

-- Audit Logs
CREATE TABLE public.kasa_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.kasa_users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    justification TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEX'LER
CREATE INDEX idx_kasa_days_date_val ON public.kasa_days(date_val);
CREATE INDEX idx_kasa_sales_day_id ON public.kasa_sales(kasa_day_id);
CREATE INDEX idx_kasa_sales_category_id ON public.kasa_sales(category_id);
CREATE INDEX idx_kasa_sales_created_at ON public.kasa_sales(created_at);
CREATE INDEX idx_kasa_fx_trans_day_id ON public.kasa_fx_transactions(kasa_day_id);
CREATE INDEX idx_kasa_fx_rates_code ON public.kasa_exchange_rates(currency_code, created_at);
CREATE INDEX idx_kasa_movements_day_id ON public.kasa_movements(kasa_day_id);
CREATE INDEX idx_kasa_expenses_day_id ON public.kasa_expenses(kasa_day_id);
CREATE INDEX idx_kasa_bank_deposits_day_id ON public.kasa_bank_deposits(kasa_day_id);
CREATE INDEX idx_kasa_login_attempts_lookup ON public.kasa_login_attempts(ip_hash, username, attempted_at);
CREATE INDEX idx_kasa_audit_logs_user ON public.kasa_audit_logs(user_id);

-- SEED DATA
INSERT INTO public.kasa_settings (cash_reserve_target_kurus) VALUES (2000000);

INSERT INTO public.kasa_categories (name, display_order) VALUES
('Telefon', 1),
('Tablet', 2),
('Bilgisayar / Notebook', 3),
('Aksesuar', 4),
('Hizmet Bedeli', 5),
('Fotokopi', 6),
('Kargo', 7),
('Teknik Servis', 8),
('Diğer', 9);

INSERT INTO public.kasa_expense_categories (name, display_order, is_salary_category) VALUES
('Personel Maaşı', 1, true),
('Teknik Servis Gideri', 2, false),
('Yedek Parça', 3, false),
('Kira', 4, false),
('Elektrik', 5, false),
('Su', 6, false),
('İnternet / Telefon', 7, false),
('Kargo Gideri', 8, false),
('Temizlik / Ofis Gideri', 9, false),
('Yemek / İkram', 10, false),
('POS / Banka Komisyonu', 11, false),
('Vergi / Resmi Ödeme', 12, false),
('Diğer', 13, false);

-- RLS POLİTİKALARI
ALTER TABLE public.kasa_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_fx_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_bank_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kasa_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_exchange_rates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_expense_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_fx_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_expenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_bank_deposits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_audit_logs FROM PUBLIC, anon, authenticated;

COMMIT;
