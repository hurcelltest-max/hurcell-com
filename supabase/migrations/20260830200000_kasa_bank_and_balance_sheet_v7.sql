BEGIN;

-- ============================================================================
-- 1. MOVEMENT TYPE CONSTRAINT (32 TYPES PRESERVED INCLUDING bank_to_cash)
-- ============================================================================
ALTER TABLE public.kasa_movements DROP CONSTRAINT IF EXISTS chk_kasa_movements_type;
ALTER TABLE public.kasa_movements ADD CONSTRAINT chk_kasa_movements_type
CHECK (movement_type IN (
    'satis',
    'nakit_tahsilat',
    'kredi_karti_tahsilat',
    'bank_transfer_tahsilat',
    'nakit_gider',
    'iade',
    'iptal',
    'acilis_bakiyesi',
    'gun_sonu_kapanis',
    'capital_injection',
    'owner_withdrawal',
    'cash_carry_forward',
    'salary_payment',
    'technical_service_revenue',
    'technical_service_expense',
    'inventory_purchase',
    'bank_deposit',
    'fx_sale_payment',
    'fx_capital_injection',
    'fx_conversion_to_try',
    'fx_bank_deposit',
    'fx_return',
    'credit_tahsilat',
    'satis_duzeltme_iptal',
    'satis_duzeltme_yeni',
    'gider_duzeltme_iptal',
    'gider_duzeltme_yeni',
    'gider_iptal',
    'ts_cost_cash_payment',
    'ts_cost_cash_refund',
    'carryover_repair',
    'bank_to_cash'
));

-- ============================================================================
-- 2. EXPLICIT CLEANUP OF ALL PRODUCTION RPC OVERLOADS
-- ============================================================================

-- Production Overloads for fn_kasa_create_sale (3 existing + canonical cleanups)
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT);

-- Production Overloads for fn_kasa_cancel_sale (2 existing + canonical cleanups)
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT);

-- Production Overloads for fn_kasa_update_sale (1 existing + canonical cleanups)
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT);

-- Bank and POS Function Drops
DROP FUNCTION IF EXISTS public.fn_kasa_configure_pos_settings(UUID, TIMESTAMPTZ, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_configure_pos_settings(UUID, UUID, TIMESTAMPTZ, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_settle_pos_to_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_settle_pos_to_bank(UUID, BIGINT, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_bank_transaction(UUID, UUID, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_create_bank_transaction(UUID, UUID, TEXT, BIGINT, DATE, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_withdraw_owner_capital_from_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT);

-- ============================================================================
-- 3. BANK ACCOUNTS TABLE (MUST PRECEDE ALL REFERENCES)
-- ============================================================================
-- Table 1: Bank Accounts
CREATE TABLE IF NOT EXISTS public.kasa_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_no TEXT,
    iban TEXT,
    currency_code TEXT NOT NULL DEFAULT 'TRY',
    opening_balance_kurus BIGINT NOT NULL DEFAULT 0,
    current_balance_kurus BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. IDEMPOTENT COLUMN ADDITIONS & SAFE LEGACY CONVERSION
-- ============================================================================
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS service_cost_payment_source TEXT DEFAULT NULL;
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS service_cost_bank_account_id UUID REFERENCES public.kasa_bank_accounts(id) DEFAULT NULL;

UPDATE public.kasa_sales
SET service_cost_payment_source = CASE
    WHEN service_cost_payment_status = 'paid_from_cash' THEN 'cash'
    WHEN service_cost_payment_status = 'paid_from_bank' THEN 'bank'
    WHEN service_cost_payment_status = 'used_from_stock' THEN 'stock'
    WHEN service_cost_payment_status = 'previously_paid' THEN 'previously_paid'
    WHEN service_cost_payment_status = 'no_cost' THEN 'none'
    ELSE NULL END
WHERE service_cost_payment_source IS NULL;

-- ============================================================================
-- 5. ENUM & CONSTRAINT ALIGNMENT
-- ============================================================================

-- A1. Add sales service cost payment source constraint
ALTER TABLE public.kasa_sales
    DROP CONSTRAINT IF EXISTS chk_kasa_sales_service_cost_payment_source;

ALTER TABLE public.kasa_sales
    ADD CONSTRAINT chk_kasa_sales_service_cost_payment_source
    CHECK (
        service_cost_payment_source IN ('cash', 'bank', 'stock', 'previously_paid', 'none')
        OR service_cost_payment_source IS NULL
    );

-- A2. Update sales service cost status constraint to include all explicit statuses
ALTER TABLE public.kasa_sales
    DROP CONSTRAINT IF EXISTS chk_kasa_sales_service_cost_payment_status;

ALTER TABLE public.kasa_sales
    ADD CONSTRAINT chk_kasa_sales_service_cost_payment_status
    CHECK (service_cost_payment_status IN (
        'paid_from_cash',
        'paid_from_bank',
        'used_from_stock',
        'previously_paid',
        'previously_paid_or_stock',
        'unpaid',
        'no_cost',
        'legacy_unspecified'
    ));

-- B. Service cost status validation trigger function
CREATE OR REPLACE FUNCTION public.fn_kasa_validate_service_cost_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_ts BOOLEAN := false;
    v_bank_active BOOLEAN;
    v_bank_curr TEXT;
BEGIN
    -- Dynamically check if category is Teknik Servis
    IF NEW.category_id IS NOT NULL THEN
        SELECT (name = 'Teknik Servis') INTO v_is_ts
        FROM public.kasa_categories
        WHERE id = NEW.category_id;
    END IF;

    -- Non-Teknik Servis sales: Enforce NULL service_cost_payment_source and NULL bank_account_id
    IF NOT COALESCE(v_is_ts, false) THEN
        NEW.service_cost_payment_source := NULL;
        NEW.service_cost_bank_account_id := NULL;
        RETURN NEW;
    END IF;

    -- LEGACY INSERT GUARD: Reject legacy statuses on new INSERTs
    IF TG_OP = 'INSERT' AND NEW.service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified') THEN
        RAISE EXCEPTION 'YENİ_SATIŞ_LEGACY_STATÜ_YASAK: Yeni Teknik Servis satışlarında birleşik/belirsiz maliyet statüsü kullanılamaz.';
    END IF;

    -- LEGACY UPDATE PRESERVATION & FIELD MODIFICATION GUARD
    IF TG_OP = 'UPDATE' AND NEW.service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified') THEN
        IF OLD.service_cost_payment_status <> NEW.service_cost_payment_status THEN
            RAISE EXCEPTION 'LEGACY_STATÜ_DEĞİŞTİRİLEMEZ: Var olan bir kaydın maliyet statüsü legacy duruma değiştirilemez.';
        END IF;

        IF NEW.service_cost_kurus IS DISTINCT FROM OLD.service_cost_kurus
           OR NEW.service_cost_payment_source IS DISTINCT FROM OLD.service_cost_payment_source
           OR NEW.service_cost_bank_account_id IS DISTINCT FROM OLD.service_cost_bank_account_id
           OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
            RAISE EXCEPTION 'Legacy Teknik Servis maliyet bilgisi değiştirilemez. Düzeltme için açık bir maliyet karşılama yöntemi seçiniz.';
        END IF;
    END IF;

    -- VALIDATE STATUS / SOURCE / BANK ACCOUNT MATRIX (STRICT MATCHING, NO SILENT MUTATION)
    IF NEW.service_cost_payment_status = 'paid_from_cash' THEN
        IF NEW.service_cost_payment_source IS DISTINCT FROM 'cash' THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Kasadan ödemelerde maliyet kaynağı cash olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Kasadan ödenen Teknik Servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Kasadan ödemelerde banka hesabı seçilemez.';
        END IF;

    ELSIF NEW.service_cost_payment_status = 'paid_from_bank' THEN
        IF NEW.service_cost_payment_source IS DISTINCT FROM 'bank' THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Bankadan ödemelerde maliyet kaynağı bank olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Bankadan ödenen Teknik Servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BANKA_HESABI: Bankadan ödenen Teknik Servis maliyeti için aktif bir TRY banka hesabı seçilmelidir.';
        END IF;

        -- Lock and verify bank account existence, active state, and TRY currency
        SELECT is_active, currency_code INTO v_bank_active, v_bank_curr
        FROM public.kasa_bank_accounts
        WHERE id = NEW.service_cost_bank_account_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı.';
        END IF;
        IF NOT COALESCE(v_bank_active, false) THEN
            RAISE EXCEPTION 'PASİF_BANKA_HESABI: Seçilen banka hesabı aktif değildir.';
        END IF;
        IF COALESCE(v_bank_curr, 'TRY') <> 'TRY' THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_PARA_BİRİMİ: Bankadan maliyet ödemesi yalnızca TRY hesaplarından yapılabilir.';
        END IF;

        NEW.service_cost_payment_source := 'bank';

    ELSIF NEW.service_cost_payment_status = 'used_from_stock' THEN
        IF NEW.service_cost_payment_source IS DISTINCT FROM 'stock' THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Stoktan kullanımlarda maliyet kaynağı stock olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Stoktan kullanılan Teknik Servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Stoktan kullanımlarda banka hesabı seçilemez.';
        END IF;

    ELSIF NEW.service_cost_payment_status = 'previously_paid' THEN
        IF NEW.service_cost_payment_source IS DISTINCT FROM 'previously_paid' THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Önceden ödemelerde maliyet kaynağı previously_paid olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Önceden ödenen Teknik Servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Önceden ödemelerde banka hesabı seçilemez.';
        END IF;

    ELSIF NEW.service_cost_payment_status = 'unpaid' THEN
        IF NEW.service_cost_payment_source IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Ödenmemiş maliyetlerde maliyet kaynağı NULL olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Ödenmemiş Teknik Servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Ödenmemiş maliyetlerde banka hesabı seçilemez.';
        END IF;

    ELSIF NEW.service_cost_payment_status = 'no_cost' THEN
        IF NEW.service_cost_payment_source IS DISTINCT FROM 'none' THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Maliyet yok statüsünde maliyet kaynağı none olmalıdır.';
        END IF;
        IF COALESCE(NEW.service_cost_kurus, 0) <> 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Maliyet yok statüsündeki işlemde maliyet 0 TL olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Maliyet yok statüsünde banka hesabı seçilemez.';
        END IF;

    ELSIF NEW.service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified') THEN
        IF NEW.service_cost_payment_source IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Legacy statülerde maliyet kaynağı NULL olmalıdır.';
        END IF;
        IF NEW.service_cost_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ: Legacy statülerde banka hesabı seçilemez.';
        END IF;
    ELSE
        RAISE EXCEPTION 'GEÇERSİZ_MALİYET_STATÜSÜ: Tanımsız maliyet ödeme durumu (%).', NEW.service_cost_payment_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kasa_validate_service_cost_status ON public.kasa_sales;

CREATE TRIGGER trg_kasa_validate_service_cost_status
    BEFORE INSERT OR UPDATE ON public.kasa_sales
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_kasa_validate_service_cost_status();

-- ============================================================================
-- 6. REMAINING TABLE DEFINITIONS (SETTINGS, TRANSACTIONS, IDEMPOTENCY)
-- ============================================================================

-- Table 2: Bank Settings (POS Settlement Tracking)
CREATE TABLE IF NOT EXISTS public.kasa_bank_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    pos_tracking_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_pos_receivable_kurus BIGINT NOT NULL DEFAULT 0,
    pos_bank_account_id UUID REFERENCES public.kasa_bank_accounts(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id UUID REFERENCES public.kasa_users(id)
);

INSERT INTO public.kasa_bank_settings (id, pos_tracking_start_at, opening_pos_receivable_kurus)
VALUES ('default', now(), 0)
ON CONFLICT (id) DO NOTHING;

-- Table 3: Bank Transactions
CREATE TABLE IF NOT EXISTS public.kasa_bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES public.kasa_bank_accounts(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount_kurus BIGINT NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    justification TEXT,
    reference_no TEXT,
    related_expense_id UUID REFERENCES public.kasa_expenses(id) ON DELETE SET NULL,
    related_sale_id UUID REFERENCES public.kasa_sales(id) ON DELETE SET NULL,
    related_transfer_id UUID,
    status TEXT NOT NULL DEFAULT 'active',
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_kasa_bank_tx_type CHECK (transaction_type IN (
        'opening_balance',
        'capital_injection',
        'owner_withdrawal',
        'pos_settlement',
        'bank_expense',
        'ts_cost_payment',
        'bank_transfer_in',
        'bank_transfer_out',
        'bank_to_cash_withdrawal',
        'cash_to_bank_deposit',
        'bank_adjustment'
    )),
    CONSTRAINT chk_kasa_bank_tx_direction CHECK (direction IN ('in', 'out')),
    CONSTRAINT chk_kasa_bank_tx_amount CHECK (amount_kurus > 0),
    CONSTRAINT chk_kasa_bank_tx_status CHECK (status IN ('active', 'cancelled'))
);

-- Table 4: Idempotency Keys (API Replay Protection)
CREATE TABLE IF NOT EXISTS public.kasa_idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    action_name TEXT NOT NULL,
    response_body JSONB NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Bank and Transaction tables
CREATE INDEX IF NOT EXISTS idx_kasa_bank_accounts_active ON public.kasa_bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_tx_account ON public.kasa_bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_tx_date ON public.kasa_bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_tx_status ON public.kasa_bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_tx_related_expense ON public.kasa_bank_transactions(related_expense_id);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_tx_related_sale ON public.kasa_bank_transactions(related_sale_id);
CREATE INDEX IF NOT EXISTS idx_kasa_idempotency_created ON public.kasa_idempotency_keys(created_at);

-- ============================================================================
-- 7. HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_kasa_check_idempotency(
    p_actor_user_id UUID,
    p_idempotency_key TEXT,
    p_request_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_hash TEXT;
BEGIN
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'EKSİK_İDEMPOTENCY_KEY: Finansal işlem için idempotency key zorunludur.';
    END IF;

    v_hash := md5(p_request_payload::text);

    SELECT * INTO v_rec FROM public.kasa_idempotency_keys WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_rec.request_hash != v_hash THEN
            RAISE EXCEPTION 'ÇAKIŞAN_İDEMPOTENCY_KEY: Aynı idempotency key farklı bir işlem isteği ile kullanılamaz.';
        END IF;
        RETURN v_rec.response_body;
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_save_idempotency(
    p_actor_user_id UUID,
    p_idempotency_key TEXT,
    p_action_name TEXT,
    p_request_payload JSONB,
    p_response_body JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hash TEXT := md5(p_request_payload::text);
BEGIN
    INSERT INTO public.kasa_idempotency_keys (
        idempotency_key, request_hash, action_name, response_body, created_by_user_id
    ) VALUES (
        p_idempotency_key, v_hash, p_action_name, p_response_body, p_actor_user_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
EXCEPTION WHEN unique_violation THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_recalculate_bank_balance(p_bank_account_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_opening BIGINT := 0;
    v_in BIGINT := 0;
    v_out BIGINT := 0;
    v_new_balance BIGINT := 0;
BEGIN
    SELECT COALESCE(opening_balance_kurus, 0) INTO v_opening
    FROM public.kasa_bank_accounts WHERE id = p_bank_account_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_in
    FROM public.kasa_bank_transactions
    WHERE bank_account_id = p_bank_account_id AND direction = 'in' AND status = 'active';

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_out
    FROM public.kasa_bank_transactions
    WHERE bank_account_id = p_bank_account_id AND direction = 'out' AND status = 'active';

    v_new_balance := v_opening + v_in - v_out;

    UPDATE public.kasa_bank_accounts
    SET current_balance_kurus = v_new_balance,
        updated_at = now()
    WHERE id = p_bank_account_id;

    RETURN v_new_balance;
END;
$$;

-- ============================================================================
-- 7. POS & BANK TRANSACTION RPCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_kasa_configure_pos_settings(
    p_actor_user_id UUID,
    p_pos_bank_account_id UUID,
    p_pos_tracking_start_at TIMESTAMPTZ,
    p_opening_pos_receivable_kurus BIGINT,
    p_justification TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_account_rec RECORD;
    v_existing_settings RECORD;
    v_active_settlements_count INT := 0;
    v_res JSONB;
BEGIN
    SELECT role INTO v_actor_role FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor_role IS NULL OR v_actor_role != 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ_İŞLEM: POS ayarlarını yapılandırma yalnızca yöneticilere açıktır.';
    END IF;

    IF p_pos_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'EKSİK_BİLGİ: POS alacaklarının aktarılacağı hedef banka hesabı zorunludur.';
    END IF;

    SELECT * INTO v_account_rec FROM public.kasa_bank_accounts WHERE id = p_pos_bank_account_id;
    IF NOT FOUND OR NOT v_account_rec.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: Seçilen POS hedef banka hesabı bulunamadı veya pasif durumda.';
    END IF;

    SELECT * INTO v_existing_settings FROM public.kasa_bank_settings WHERE id = 'default';

    IF v_existing_settings.pos_bank_account_id IS NOT NULL AND v_existing_settings.pos_bank_account_id != p_pos_bank_account_id THEN
        SELECT COUNT(*) INTO v_active_settlements_count
        FROM public.kasa_bank_transactions
        WHERE transaction_type = 'pos_settlement' AND status = 'active';

        IF v_active_settlements_count > 0 AND (p_justification IS NULL OR TRIM(p_justification) = '') THEN
            RAISE EXCEPTION 'GEREKÇE_ZORUNLU: Mevcut POS işlemlerinin bulunduğu hesabı değiştirmek için gerekçe belirtilmelidir.';
        END IF;
    END IF;

    INSERT INTO public.kasa_bank_settings (
        id, pos_tracking_start_at, opening_pos_receivable_kurus, pos_bank_account_id, updated_at, updated_by_user_id
    ) VALUES (
        'default',
        COALESCE(p_pos_tracking_start_at, now()),
        COALESCE(p_opening_pos_receivable_kurus, 0),
        p_pos_bank_account_id,
        now(),
        p_actor_user_id
    )
    ON CONFLICT (id) DO UPDATE SET
        pos_tracking_start_at = COALESCE(EXCLUDED.pos_tracking_start_at, public.kasa_bank_settings.pos_tracking_start_at),
        opening_pos_receivable_kurus = COALESCE(EXCLUDED.opening_pos_receivable_kurus, public.kasa_bank_settings.opening_pos_receivable_kurus),
        pos_bank_account_id = EXCLUDED.pos_bank_account_id,
        updated_at = now(),
        updated_by_user_id = p_actor_user_id;

    v_res := jsonb_build_object(
        'success', true,
        'pos_bank_account_id', p_pos_bank_account_id,
        'pos_tracking_start_at', COALESCE(p_pos_tracking_start_at, now()),
        'opening_pos_receivable_kurus', COALESCE(p_opening_pos_receivable_kurus, 0)
    );

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_settle_pos_to_bank(
    p_actor_user_id UUID,
    p_bank_account_id UUID,
    p_amount_kurus BIGINT,
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL,
    p_reference_no TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_account_rec RECORD;
    v_tx_id UUID;
    v_new_balance BIGINT;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
BEGIN
    SELECT role INTO v_actor_role FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor_role IS NULL OR v_actor_role != 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ_İŞLEM: POS tahsilatını bankaya aktarma yalnızca yöneticilere açıktır.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Aktarım tutarı 0 TL den büyük olmalıdır.';
    END IF;

    v_payload := jsonb_build_object(
        'bank_account_id', p_bank_account_id,
        'amount_kurus', p_amount_kurus,
        'transaction_date', p_transaction_date,
        'reference_no', p_reference_no
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    SELECT * INTO v_account_rec FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR NOT v_account_rec.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: Seçilen banka hesabı bulunamadı veya pasif durumda.';
    END IF;

    INSERT INTO public.kasa_bank_transactions (
        bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, status, created_by_user_id
    ) VALUES (
        p_bank_account_id, 'pos_settlement', 'in', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
        COALESCE(p_description, 'POS Hesaba Geçiş Tahsilatı'), p_reference_no, 'active', p_actor_user_id
    ) RETURNING id INTO v_tx_id;

    v_new_balance := public.fn_kasa_recalculate_bank_balance(p_bank_account_id);

    v_res := jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'bank_account_id', p_bank_account_id,
        'new_balance_kurus', v_new_balance
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'settle_pos_to_bank', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_withdraw_owner_capital_from_bank(
    p_actor_user_id UUID,
    p_bank_account_id UUID,
    p_amount_kurus BIGINT,
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL,
    p_reference_no TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_account_rec RECORD;
    v_tx_id UUID;
    v_new_balance BIGINT;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
BEGIN
    SELECT role INTO v_actor_role FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor_role IS NULL OR v_actor_role != 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ_İŞLEM: Bankadan şirket sahibine sermaye/kâr çekimi yalnızca yöneticilere açıktır.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Çekim tutarı 0 TL den büyük olmalıdır.';
    END IF;

    v_payload := jsonb_build_object(
        'bank_account_id', p_bank_account_id,
        'amount_kurus', p_amount_kurus,
        'transaction_date', p_transaction_date,
        'reference_no', p_reference_no
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    SELECT * INTO v_account_rec FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR NOT v_account_rec.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: Seçilen banka hesabı bulunamadı veya pasif durumda.';
    END IF;

    IF v_account_rec.current_balance_kurus < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında bu çekim için yeterli bakiye bulunmuyor. Mevcut Bakiye: % TL, İstenen: % TL',
            (v_account_rec.current_balance_kurus / 100.0), (p_amount_kurus / 100.0);
    END IF;

    INSERT INTO public.kasa_bank_transactions (
        bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, status, created_by_user_id
    ) VALUES (
        p_bank_account_id, 'owner_withdrawal', 'out', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
        COALESCE(p_description, 'Şirket Sahibine Sermaye / Kâr Çekimi (Banka)'), p_reference_no, 'active', p_actor_user_id
    ) RETURNING id INTO v_tx_id;

    v_new_balance := public.fn_kasa_recalculate_bank_balance(p_bank_account_id);

    v_res := jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'bank_account_id', p_bank_account_id,
        'new_balance_kurus', v_new_balance
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'withdraw_owner_capital_from_bank', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_create_bank_transaction(
    p_actor_user_id UUID,
    p_bank_account_id UUID,
    p_transaction_type TEXT,
    p_amount_kurus BIGINT,
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL,
    p_reference_no TEXT DEFAULT NULL,
    p_target_bank_account_id UUID DEFAULT NULL,
    p_expense_category_id UUID DEFAULT NULL,
    p_is_vat_inclusive BOOLEAN DEFAULT false,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_source_acc RECORD;
    v_target_acc RECORD;
    v_direction TEXT;
    v_tx_id UUID;
    v_target_tx_id UUID;
    v_expense_id UUID;
    v_today_day RECORD;
    v_res JSONB;
    v_payload JSONB;
    v_cached JSONB;
BEGIN
    SELECT role INTO v_actor_role FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor_role IS NULL OR v_actor_role != 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ_İŞLEM: Banka işlemlerini yönetme yetkisi yalnızca yöneticilere aittir.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: İşlem tutarı 0 TL den büyük olmalıdır.';
    END IF;

    v_payload := jsonb_build_object(
        'bank_account_id', p_bank_account_id,
        'transaction_type', p_transaction_type,
        'amount_kurus', p_amount_kurus,
        'transaction_date', p_transaction_date,
        'target_bank_account_id', p_target_bank_account_id,
        'reference_no', p_reference_no
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    SELECT * INTO v_source_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR NOT v_source_acc.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: İşlem yapılacak banka hesabı bulunamadı veya pasif durumda.';
    END IF;

    IF p_transaction_type = 'bank_expense' THEN
        v_direction := 'out';
        IF v_source_acc.current_balance_kurus < p_amount_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında gider için yeterli bakiye bulunmuyor.';
        END IF;

        IF p_expense_category_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BİLGİ: Banka gideri için gider kategorisi seçilmelidir.';
        END IF;

        SELECT * INTO v_today_day FROM public.kasa_days WHERE status = 'open' ORDER BY date_val DESC LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'AÇIK_KASA_GÜNÜ_YOK: Bankadan gider kaydı oluşturmak için açık bir kasa günü bulunmalıdır.';
        END IF;

        INSERT INTO public.kasa_expenses (
            kasa_day_id, category_id, amount_kurus, description, is_vat_inclusive, is_bank_expense, bank_account_id, created_by_user_id
        ) VALUES (
            v_today_day.id, p_expense_category_id, p_amount_kurus, p_description, COALESCE(p_is_vat_inclusive, false), true, p_bank_account_id, p_actor_user_id
        ) RETURNING id INTO v_expense_id;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, related_expense_id, status, created_by_user_id
        ) VALUES (
            p_bank_account_id, 'bank_expense', 'out', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
            p_description, p_reference_no, v_expense_id, 'active', p_actor_user_id
        ) RETURNING id INTO v_tx_id;

    ELSIF p_transaction_type = 'capital_injection' THEN
        v_direction := 'in';
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, status, created_by_user_id
        ) VALUES (
            p_bank_account_id, 'capital_injection', 'in', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
            p_description, p_reference_no, 'active', p_actor_user_id
        ) RETURNING id INTO v_tx_id;

    ELSIF p_transaction_type = 'bank_transfer_out' THEN
        v_direction := 'out';
        IF p_target_bank_account_id IS NULL OR p_target_bank_account_id = p_bank_account_id THEN
            RAISE EXCEPTION 'GEÇERSİZ_HEDEF_HESAP: Virman yapılacak farklı ve geçerli bir hedef banka hesabı seçilmelidir.';
        END IF;

        IF v_source_acc.current_balance_kurus < p_amount_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Virman için kaynak banka hesabında yeterli bakiye bulunmuyor.';
        END IF;

        SELECT * INTO v_target_acc FROM public.kasa_bank_accounts WHERE id = p_target_bank_account_id FOR UPDATE;
        IF NOT FOUND OR NOT v_target_acc.is_active THEN
            RAISE EXCEPTION 'GEÇERSİZ_HEDEF_HESAP: Hedef banka hesabı bulunamadı veya pasif durumda.';
        END IF;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, status, created_by_user_id
        ) VALUES (
            p_bank_account_id, 'bank_transfer_out', 'out', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
            COALESCE(p_description, 'Banka Virman Çıkışı'), p_reference_no, 'active', p_actor_user_id
        ) RETURNING id INTO v_tx_id;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, related_transfer_id, status, created_by_user_id
        ) VALUES (
            p_target_bank_account_id, 'bank_transfer_in', 'in', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
            COALESCE(p_description, 'Banka Virman Girişi'), p_reference_no, v_tx_id, 'active', p_actor_user_id
        ) RETURNING id INTO v_target_tx_id;

        UPDATE public.kasa_bank_transactions SET related_transfer_id = v_target_tx_id WHERE id = v_tx_id;
        PERFORM public.fn_kasa_recalculate_bank_balance(p_target_bank_account_id);

    ELSIF p_transaction_type = 'bank_to_cash_withdrawal' THEN
        v_direction := 'out';
        IF v_source_acc.current_balance_kurus < p_amount_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Kasaya nakit aktarmak için banka hesabında yeterli bakiye bulunmuyor.';
        END IF;

        SELECT * INTO v_today_day FROM public.kasa_days WHERE status = 'open' ORDER BY date_val DESC LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'AÇIK_KASA_GÜNÜ_YOK: Bankadan kasaya nakit çekimi için açık bir kasa günü bulunmalıdır.';
        END IF;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, reference_no, status, created_by_user_id
        ) VALUES (
            p_bank_account_id, 'bank_to_cash_withdrawal', 'out', p_amount_kurus, COALESCE(p_transaction_date, CURRENT_DATE),
            COALESCE(p_description, 'Bankadan Nakit Kasaya Çekim'), p_reference_no, 'active', p_actor_user_id
        ) RETURNING id INTO v_tx_id;

        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_today_day.id, 'bank_to_cash', p_amount_kurus, p_amount_kurus,
            COALESCE(p_description, 'Bankadan Kasaya Nakit Girişi (' || v_source_acc.bank_name || ')'), p_actor_user_id
        );

    ELSE
        RAISE EXCEPTION 'DESTEKLENMEYEN_İŞLEM: Bu işlem türü doğrudan fn_kasa_create_bank_transaction üzerinden yapılamaz.';
    END IF;

    PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);

    v_res := jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'related_expense_id', v_expense_id,
        'related_transfer_id', v_target_tx_id
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'create_bank_transaction', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- ============================================================================
-- 8. COMPLETE CANONICAL SALES RPCS (CREATE, UPDATE, CANCEL)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL,
    p_service_cost_kurus BIGINT DEFAULT NULL,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_serial_imei TEXT DEFAULT NULL,
    p_technical_service_details JSONB DEFAULT NULL,
    p_service_cost_payment_status TEXT DEFAULT NULL,
    p_service_cost_payment_source TEXT DEFAULT NULL,
    p_service_cost_bank_account_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_day_rec RECORD;
    v_bank_rec RECORD;
    v_cat_name TEXT;
    v_payload JSONB;
    v_cached JSONB;
    v_sale_id UUID;
    v_bank_tx_id UUID;
    v_res JSONB;
BEGIN
    SELECT * INTO v_day_rec FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;

    -- Actor user validation and Manager role check for bank payments
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    IF (p_service_cost_payment_status = 'paid_from_bank' OR p_service_cost_payment_source = 'bank') THEN
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
        END IF;
    END IF;
    IF NOT FOUND OR v_day_rec.status != 'open' THEN
        RAISE EXCEPTION 'KASA_GÜNÜ_KAPALI: Satış işlemi yalnızca açık kasa gününden yapılabilir.';
    END IF;

    SELECT name INTO v_cat_name FROM public.kasa_categories WHERE id = p_category_id;

    v_payload := jsonb_build_object(
        'kasa_day_id', p_kasa_day_id,
        'category_id', p_category_id,
        'total_price_kurus', p_total_price_kurus,
        'service_cost_kurus', p_service_cost_kurus,
        'service_cost_payment_status', p_service_cost_payment_status,
        'service_cost_bank_account_id', p_service_cost_bank_account_id,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        IF p_service_cost_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BANKA_HESABI: Bankadan ödenen teknik servis maliyeti için banka hesabı seçilmelidir.';
        END IF;
        IF COALESCE(p_service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Bankadan ödenen servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;

        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = p_service_cost_bank_account_id FOR UPDATE;
        IF NOT FOUND OR NOT v_bank_rec.is_active THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif durumda.';
        END IF;
        IF v_bank_rec.current_balance_kurus < p_service_cost_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında servis maliyeti ödemesi için yeterli bakiye yok.';
        END IF;
    END IF;

    INSERT INTO public.kasa_sales (
        kasa_day_id, category_id, quantity, unit_price_kurus, total_price_kurus,
        cost_price_kurus, service_cost_kurus, cash_paid_kurus, card_paid_kurus,
        bank_transfer_paid_kurus, bank_transfer_reference, usd_paid_cents, usd_rate,
        usd_tl_equivalent_kurus, eur_paid_cents, eur_rate, eur_tl_equivalent_kurus,
        credit_customer_id, credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus,
        description, customer_name, customer_phone, serial_imei, technical_service_details,
        service_cost_payment_status, service_cost_payment_source, service_cost_bank_account_id,
        service_cost_paid_at, service_cost_paid_by_user_id, status, created_by_user_id
    ) VALUES (
        p_kasa_day_id, p_category_id, p_quantity, p_unit_price_kurus, p_total_price_kurus,
        p_cost_price_kurus, p_service_cost_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        p_bank_transfer_paid_kurus, p_bank_transfer_reference, p_usd_paid_cents, p_usd_rate,
        p_usd_tl_equivalent_kurus, p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
        p_credit_customer_id, p_credit_paid_kurus, p_uncollected_credit_kurus, p_uncollected_cost_kurus,
        p_description, p_customer_name, p_customer_phone, p_serial_imei, p_technical_service_details,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_payment_status ELSE COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock') END,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_payment_source ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_bank_account_id ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN now() ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN p_actor_user_id ELSE NULL END,
        'completed', p_actor_user_id
    ) RETURNING id INTO v_sale_id;

    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, related_sale_id, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi (Satış Anında)', v_sale_id, p_actor_user_id
        ) RETURNING id INTO v_bank_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    v_res := jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bank_transaction_id', v_bank_tx_id);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'create_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_category_id UUID,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL,
    p_service_cost_kurus BIGINT DEFAULT NULL,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_serial_imei TEXT DEFAULT NULL,
    p_technical_service_details JSONB DEFAULT NULL,
    p_service_cost_payment_status TEXT DEFAULT NULL,
    p_service_cost_payment_source TEXT DEFAULT NULL,
    p_service_cost_bank_account_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_sale_rec RECORD;
    v_existing_tx RECORD;
    v_bank_rec RECORD;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
BEGIN
    SELECT * INTO v_sale_rec FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;

    -- Actor user validation and Manager role check for bank payments
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    IF (p_service_cost_payment_status = 'paid_from_bank' OR p_service_cost_payment_source = 'bank') THEN
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
        END IF;
    END IF;
    IF NOT FOUND OR v_sale_rec.status != 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: Güncellenecek tamamlanmış satış bulunamadı.';
    END IF;

    v_payload := jsonb_build_object(
        'sale_id', p_sale_id,
        'category_id', p_category_id,
        'total_price_kurus', p_total_price_kurus,
        'service_cost_payment_status', p_service_cost_payment_status,
        'service_cost_bank_account_id', p_service_cost_bank_account_id
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- Cancel existing active bank transaction if previously paid_from_bank
    SELECT * INTO v_existing_tx FROM public.kasa_bank_transactions
    WHERE related_sale_id = p_sale_id AND transaction_type = 'ts_cost_payment' AND status = 'active'
    FOR UPDATE;

    IF v_existing_tx.id IS NOT NULL THEN
        UPDATE public.kasa_bank_transactions SET status = 'cancelled', updated_at = now() WHERE id = v_existing_tx.id;
        PERFORM public.fn_kasa_recalculate_bank_balance(v_existing_tx.bank_account_id);
    END IF;

    IF p_service_cost_payment_status = 'paid_from_bank' THEN
        IF p_service_cost_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BANKA_HESABI: Bankadan ödenen teknik servis maliyeti için banka hesabı seçilmelidir.';
        END IF;

        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = p_service_cost_bank_account_id FOR UPDATE;
        IF NOT FOUND OR NOT v_bank_rec.is_active THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif durumda.';
        END IF;
        IF v_bank_rec.current_balance_kurus < p_service_cost_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında servis maliyeti ödemesi için yeterli bakiye yok.';
        END IF;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, related_sale_id, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi (Satış Düzeltme)', p_sale_id, p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    UPDATE public.kasa_sales SET
        category_id = p_category_id,
        quantity = p_quantity,
        unit_price_kurus = p_unit_price_kurus,
        total_price_kurus = p_total_price_kurus,
        cost_price_kurus = p_cost_price_kurus,
        service_cost_kurus = p_service_cost_kurus,
        cash_paid_kurus = p_cash_paid_kurus,
        card_paid_kurus = p_card_paid_kurus,
        bank_transfer_paid_kurus = p_bank_transfer_paid_kurus,
        bank_transfer_reference = p_bank_transfer_reference,
        usd_paid_cents = p_usd_paid_cents,
        usd_rate = p_usd_rate,
        usd_tl_equivalent_kurus = p_usd_tl_equivalent_kurus,
        eur_paid_cents = p_eur_paid_cents,
        eur_rate = p_eur_rate,
        eur_tl_equivalent_kurus = p_eur_tl_equivalent_kurus,
        credit_customer_id = p_credit_customer_id,
        credit_paid_kurus = p_credit_paid_kurus,
        uncollected_credit_kurus = p_uncollected_credit_kurus,
        uncollected_cost_kurus = p_uncollected_cost_kurus,
        description = p_description,
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        serial_imei = p_serial_imei,
        technical_service_details = p_technical_service_details,
        service_cost_payment_status = p_service_cost_payment_status,
        service_cost_payment_source = p_service_cost_payment_source,
        service_cost_bank_account_id = p_service_cost_bank_account_id,
        updated_at = now()
    WHERE id = p_sale_id;

    v_res := jsonb_build_object('success', true, 'sale_id', p_sale_id);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'update_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT,
    p_cancel_movements BOOLEAN DEFAULT true,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_sale RECORD;
    v_bank_tx RECORD;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
BEGIN
    -- Actor user validation and Manager role check for cancellation
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    IF v_actor_role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ_İŞLEM: Satış iptali yetkisi yalnızca yöneticilere aittir.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND OR v_sale.status != 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: İptal edilecek tamamlanmış satış bulunamadı.';
    END IF;

    IF p_justification IS NULL OR TRIM(p_justification) = '' THEN
        RAISE EXCEPTION 'GEREKÇE_ZORUNLU: Satış iptali için geçerli bir gerekçe belirtilmelidir.';
    END IF;

    v_payload := jsonb_build_object('sale_id', p_sale_id, 'justification', p_justification);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- If sale had paid_from_bank cost, reverse the bank transaction
    SELECT * INTO v_bank_tx FROM public.kasa_bank_transactions
    WHERE related_sale_id = p_sale_id AND transaction_type = 'ts_cost_payment' AND status = 'active'
    FOR UPDATE;

    IF v_bank_tx.id IS NOT NULL THEN
        UPDATE public.kasa_bank_transactions SET status = 'cancelled', updated_at = now() WHERE id = v_bank_tx.id;
        PERFORM public.fn_kasa_recalculate_bank_balance(v_bank_tx.bank_account_id);
    END IF;

    -- Update sale status to cancelled
    UPDATE public.kasa_sales
    SET status = 'cancelled',
        description = COALESCE(description, '') || ' [İPTAL: ' || p_justification || ']',
        updated_at = now()
    WHERE id = p_sale_id;

    v_res := jsonb_build_object('success', true, 'sale_id', p_sale_id, 'cancelled_bank_tx_id', v_bank_tx.id);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'cancel_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- ============================================================================
-- 10. PERMISSIONS & STRICT SECURITY HARDENING (RLS & SERVICE_ROLE ONLY)
-- ============================================================================

-- Table RLS & Grants
ALTER TABLE public.kasa_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kasa_bank_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kasa_bank_accounts TO service_role;

ALTER TABLE public.kasa_bank_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kasa_bank_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kasa_bank_transactions TO service_role;

ALTER TABLE public.kasa_bank_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kasa_bank_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kasa_bank_settings TO service_role;

ALTER TABLE public.kasa_idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kasa_idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kasa_idempotency_keys TO service_role;

-- Function Execution Privileges (Explicit Signatures, Restricted to service_role)
REVOKE ALL ON FUNCTION public.fn_kasa_check_idempotency(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_check_idempotency(UUID, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_save_idempotency(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_save_idempotency(UUID, TEXT, TEXT, JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_recalculate_bank_balance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_recalculate_bank_balance(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_configure_pos_settings(UUID, UUID, TIMESTAMPTZ, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_configure_pos_settings(UUID, UUID, TIMESTAMPTZ, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_settle_pos_to_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_settle_pos_to_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_withdraw_owner_capital_from_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_withdraw_owner_capital_from_bank(UUID, UUID, BIGINT, DATE, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_create_bank_transaction(UUID, UUID, TEXT, BIGINT, DATE, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_bank_transaction(UUID, UUID, TEXT, BIGINT, DATE, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_validate_service_cost_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_validate_service_cost_status() TO service_role;

COMMIT;
