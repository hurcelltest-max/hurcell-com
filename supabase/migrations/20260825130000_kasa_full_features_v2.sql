-- Migration: 20260825130000_kasa_full_features_v2.sql
-- Description: Complete HurCELL Kasa Features v2:
-- 1. Technical Service Direct Cost tracking, payment status (paid_from_cash, previously_paid_or_stock, unpaid, legacy_unspecified) with NOT NULL column constraint after backfill.
-- 2. Strict Overload signatures with ZERO DEFAULT parameters preventing PostgreSQL/PostgREST ambiguous function (PGRST203) errors.
-- 3. Exhaustive RPC validations: User active, Day open, Category active, non-negative amounts, positive rates, penny-exact TL sum equality, bank transfer formula injection protection & max 200 chars.
-- 4. Strict Idempotency matching on all 18 financial and identity fields using IS DISTINCT FROM.
-- 5. Single direct cost source for Technical Service (cost_price_kurus set to 0 for TS to prevent double counting in profit math).
-- 6. Physical cash adequacy math factoring in same-transaction cash inflow: (Current Cash + Sale Cash - TS Direct Cost >= 0).
-- 7. Expense updates and cancellations with strict role-based security (Manager vs Personnel, Salary protection) & immutable audit logging.
-- 8. Backwards-compatible fn_kasa_cancel_sale preserving full credit account receivables reversal, credit_transactions reversal, bank transfer reversal, description logging, and optional cost refunding.
-- 9. Centralized physical cash calculation helper function (fn_kasa_get_physical_cash) used across all RPCs.

BEGIN;

-- 1. Tablo Kolon Güncellemeleri, Güvenli Backfill ve NOT NULL Kısıtlaması

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'kasa_sales' AND column_name = 'service_cost_payment_status'
    ) THEN
        ALTER TABLE public.kasa_sales ADD COLUMN service_cost_payment_status TEXT DEFAULT 'previously_paid_or_stock';
        ALTER TABLE public.kasa_sales ADD CONSTRAINT chk_kasa_sales_service_cost_payment_status 
            CHECK (service_cost_payment_status IN ('paid_from_cash', 'previously_paid_or_stock', 'unpaid', 'legacy_unspecified'));

        -- Sadece kolon ilk kez eklendiğinde mevcut eski kayıtları işaretle (tekrarlı çalıştırmada yeni kayıtları bozmaz)
        UPDATE public.kasa_sales
        SET service_cost_payment_status = 'legacy_unspecified'
        WHERE service_cost_kurus > 0;
    END IF;
END $$;

-- Kolonun NULL olmamasını sağla (eski ve yeni kayıtlar için tam bütünlük)
UPDATE public.kasa_sales SET service_cost_payment_status = 'previously_paid_or_stock' WHERE service_cost_payment_status IS NULL;
ALTER TABLE public.kasa_sales ALTER COLUMN service_cost_payment_status SET NOT NULL;

ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS service_cost_paid_at TIMESTAMPTZ;
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS service_cost_paid_by_user_id UUID REFERENCES public.kasa_users(id);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS cost_refunded_on_cancel BOOLEAN DEFAULT false;

-- B. kasa_expenses tablosuna status ve iptal detay kolonlarının eklenmesi
ALTER TABLE public.kasa_expenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.kasa_expenses DROP CONSTRAINT IF EXISTS chk_kasa_expenses_status;
ALTER TABLE public.kasa_expenses ADD CONSTRAINT chk_kasa_expenses_status CHECK (status IN ('active', 'cancelled'));

ALTER TABLE public.kasa_expenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.kasa_expenses ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES public.kasa_users(id);
ALTER TABLE public.kasa_expenses ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- C. kasa_movements movement_type CHECK kısıtlamasının genişletilmesi
ALTER TABLE public.kasa_movements DROP CONSTRAINT IF EXISTS chk_kasa_movements_type;
ALTER TABLE public.kasa_movements ADD CONSTRAINT chk_kasa_movements_type CHECK (movement_type IN (
    'satis', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'bank_transfer_tahsilat', 'nakit_gider', 'iade', 'iptal', 'acilis_bakiyesi', 'gun_sonu_kapanis',
    'capital_injection', 'owner_withdrawal', 'cash_carry_forward', 'salary_payment', 'technical_service_revenue',
    'technical_service_expense', 'inventory_purchase', 'bank_deposit', 'fx_sale_payment', 'fx_capital_injection',
    'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return', 'credit_tahsilat', 'satis_duzeltme_iptal', 'satis_duzeltme_yeni',
    'gider_duzeltme_iptal', 'gider_duzeltme_yeni', 'gider_iptal', 'ts_cost_cash_payment', 'ts_cost_cash_refund'
));


-- 2. TEK VE GÜVENİLİR FİZİKSEL NAKİT HESAPLAMA YARDIMCI FONKSİYONU
CREATE OR REPLACE FUNCTION public.fn_kasa_get_physical_cash(p_kasa_day_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_day public.kasa_days%ROWTYPE;
    v_total_cash_sales BIGINT := 0;
    v_total_cash_credit_payments BIGINT := 0;
    v_total_active_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_total_ts_cost_payments BIGINT := 0;
    v_total_ts_cost_refunds BIGINT := 0;
BEGIN
    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id;
    IF v_day.id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_credit_payments
    FROM public.kasa_credit_payments WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_active_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id AND (status = 'active' OR status IS NULL);

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    SELECT COALESCE(SUM(ABS(cash_portion_kurus)), 0) INTO v_total_ts_cost_payments
    FROM public.kasa_movements WHERE kasa_day_id = p_kasa_day_id AND movement_type = 'ts_cost_cash_payment';

    SELECT COALESCE(SUM(cash_portion_kurus), 0) INTO v_total_ts_cost_refunds
    FROM public.kasa_movements WHERE kasa_day_id = p_kasa_day_id AND movement_type = 'ts_cost_cash_refund';

    RETURN v_day.opening_balance_kurus 
         + v_day.capital_injected_kurus 
         - v_day.owner_withdrawn_kurus 
         + v_total_cash_sales 
         + v_total_cash_credit_payments 
         + v_total_fx_conversions 
         + v_total_ts_cost_refunds 
         - v_total_active_expenses 
         - v_total_bank_deposits 
         - v_total_ts_cost_payments;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_get_physical_cash(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_get_physical_cash(UUID) TO service_role;


-- 3. SECURE RPC: GİDER EKLEME (FİZİKSEL NAKİT KONTROLÜ VE YETKİNLİK İLE)
DROP FUNCTION IF EXISTS public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_expense_category_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT,
    p_recipient_name TEXT,
    p_sale_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_expense_categories%ROWTYPE;
    v_expense public.kasa_expenses%ROWTYPE;
    v_movement_type TEXT := 'nakit_gider';
    v_current_cash BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider tutarı 0 veya negatif olamaz.';
    END IF;

    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider açıklaması zorunludur.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_expense_categories WHERE id = p_expense_category_id;
    IF v_category.id IS NULL OR NOT v_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen gider kategorisi bulunamadı veya pasif.';
    END IF;

    IF v_category.is_salary_category = true AND v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Personel maaşı kaydı yalnızca yöneticiler tarafından eklenebilir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    v_current_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bu gider ödemesini karşılayacak kadar fiziki TL nakit bulunmamaktadır (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    IF v_category.is_salary_category = true THEN
        v_movement_type := 'salary_payment';
    END IF;

    INSERT INTO public.kasa_expenses (
        kasa_day_id, expense_category_id, sale_id, amount_kurus, description, recipient_name, created_by_user_id
    ) VALUES (
        p_kasa_day_id, p_expense_category_id, p_sale_id, p_amount_kurus, trim(p_description), p_recipient_name, p_actor_user_id
    ) RETURNING * INTO v_expense;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, v_movement_type, p_sale_id, -p_amount_kurus, -p_amount_kurus, 0,
        'Gider (' || v_category.name || '): ' || trim(p_description), p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gider_eklendi', 'kasa_expenses', v_expense.id, jsonb_build_object('category_name', v_category.name, 'amount_kurus', p_amount_kurus, 'recipient_name', p_recipient_name));

    RETURN to_jsonb(v_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;


-- 4. SECURE RPC: GİDER DÜZELTME
DROP FUNCTION IF EXISTS public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_update_expense(
    p_actor_user_id UUID,
    p_expense_id UUID,
    p_expense_category_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT,
    p_recipient_name TEXT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_expense public.kasa_expenses%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_old_category public.kasa_expense_categories%ROWTYPE;
    v_new_category public.kasa_expense_categories%ROWTYPE;
    v_updated_expense public.kasa_expenses%ROWTYPE;
    v_current_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
    v_new_movement_type TEXT := 'nakit_gider';
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_expense FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
    IF v_expense.id IS NULL OR v_expense.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gider kaydı bulunamadı veya değiştirilebilir durumda değil (iptal edilmiş).';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_expense.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait giderler değiştirilemez.';
    END IF;

    SELECT * INTO v_old_category FROM public.kasa_expense_categories WHERE id = v_expense.expense_category_id;
    SELECT * INTO v_new_category FROM public.kasa_expense_categories WHERE id = p_expense_category_id;

    IF v_new_category.id IS NULL OR NOT v_new_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen gider kategorisi bulunamadı veya pasif.';
    END IF;

    IF v_actor.role <> 'yonetici' THEN
        IF v_expense.created_by_user_id <> p_actor_user_id THEN
            RAISE EXCEPTION 'YETKİSİZ: Personel yalnızca kendi oluşturduğu günlük giderleri düzeltebilir.';
        END IF;

        IF v_old_category.is_salary_category = true OR v_new_category.is_salary_category = true THEN
            RAISE EXCEPTION 'YETKİSİZ: Personel maaşı kayıtları yalnızca yöneticiler tarafından düzenlenebilir.';
        END IF;
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider tutarı 0 veya negatif olamaz.';
    END IF;

    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider açıklaması zorunludur.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider düzeltme gerekçesi zorunludur.';
    END IF;

    v_current_cash := public.fn_kasa_get_physical_cash(v_expense.kasa_day_id);

    v_cash_diff := v_expense.amount_kurus - p_amount_kurus;
    IF (v_current_cash + v_cash_diff) < 0 THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Gider düzeltmesi sonrasında kasa fiziki nakit bakiyesi eksiye düşeceği için işlem reddedildi (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    IF v_new_category.is_salary_category = true THEN
        v_new_movement_type := 'salary_payment';
    END IF;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_expense.kasa_day_id, 'gider_duzeltme_iptal', v_expense.sale_id, v_expense.amount_kurus, v_expense.amount_kurus, 0,
        'Gider Düzeltme İptali (' || v_old_category.name || '): ' || trim(p_justification), p_actor_user_id
    );

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_expense.kasa_day_id, 'gider_duzeltme_yeni', v_expense.sale_id, -p_amount_kurus, -p_amount_kurus, 0,
        'Gider Düzeltme (' || v_new_category.name || '): ' || trim(p_justification), p_actor_user_id
    );

    UPDATE public.kasa_expenses SET
        expense_category_id = p_expense_category_id,
        amount_kurus = p_amount_kurus,
        description = trim(p_description),
        recipient_name = CASE WHEN p_recipient_name IS NOT NULL AND trim(p_recipient_name) <> '' THEN trim(p_recipient_name) ELSE NULL END
    WHERE id = p_expense_id
    RETURNING * INTO v_updated_expense;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gider_duzeltildi', 'kasa_expenses', p_expense_id, jsonb_build_object(
        'justification', trim(p_justification),
        'old_amount_kurus', v_expense.amount_kurus,
        'new_amount_kurus', p_amount_kurus,
        'old_category', v_old_category.name,
        'new_category', v_new_category.name,
        'description', trim(p_description)
    ));

    RETURN to_jsonb(v_updated_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT) TO service_role;


-- 5. SECURE RPC: GİDER İPTALİ
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_expense(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_expense(
    p_actor_user_id UUID,
    p_expense_id UUID,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_expense public.kasa_expenses%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_expense_categories%ROWTYPE;
    v_cancelled_expense public.kasa_expenses%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Gider kaydı iptal yetkisi yalnızca yöneticilere aittir.';
    END IF;

    SELECT * INTO v_expense FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
    IF v_expense.id IS NULL OR v_expense.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gider kaydı bulunamadı veya zaten iptal edilmiş.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_expense.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait giderler iptal edilemez.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider iptal gerekçesi zorunludur.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_expense_categories WHERE id = v_expense.expense_category_id;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_expense.kasa_day_id, 'gider_iptal', v_expense.sale_id, v_expense.amount_kurus, v_expense.amount_kurus, 0,
        'Gider İptali (' || COALESCE(v_category.name, 'Gider') || '): ' || trim(p_justification), p_actor_user_id
    );

    UPDATE public.kasa_expenses SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by_user_id = p_actor_user_id,
        cancel_reason = trim(p_justification)
    WHERE id = p_expense_id
    RETURNING * INTO v_cancelled_expense;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gider_iptal_edildi', 'kasa_expenses', p_expense_id, jsonb_build_object(
        'amount_kurus', v_expense.amount_kurus,
        'category_name', COALESCE(v_category.name, 'Gider'),
        'justification', trim(p_justification)
    ));

    RETURN to_jsonb(v_cancelled_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) TO service_role;


-- 6. SECURE RPC: SATIŞ OLUŞTURMA (EKSİKSİZ DOĞRULAMALAR + STRICT OVERLOAD - 26 PARAMS - DEFAULT YOKTUR)

DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT, TEXT
);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC(12, 4),
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC(12, 4),
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_paid_kurus BIGINT,
    p_credit_customer_id UUID,
    p_brand TEXT,
    p_model TEXT,
    p_product_code TEXT,
    p_description TEXT,
    p_idempotency_key TEXT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT,
    p_service_cost_kurus BIGINT,
    p_service_cost_payment_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_categories%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_existing public.kasa_sales%ROWTYPE;
    v_customer public.credit_customers%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_total_price BIGINT;
    v_uncollected_cost BIGINT := 0;
    v_trans_code TEXT;
    v_new_balance NUMERIC;
    v_source_type TEXT := 'store_sale';
    v_receipt_no TEXT;
    v_clean_ref TEXT;
    v_service_cost BIGINT := 0;
    v_cost_price BIGINT := 0;
    v_pay_status TEXT := 'previously_paid_or_stock';
    v_current_cash BIGINT := 0;
    v_cash_inflow_this_sale BIGINT := 0;
    v_expected_usd_tl BIGINT := 0;
    v_expected_eur_tl BIGINT := 0;
BEGIN
    -- 1. Kullanıcı Kontrolü
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    -- 2. Gün Kontrolü
    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kasa günü bulunamadı veya kapalı.';
    END IF;

    -- 3. Kategori Kontrolü
    SELECT * INTO v_category FROM public.kasa_categories WHERE id = p_category_id;
    IF v_category.id IS NULL OR NOT v_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen satış kategorisi bulunamadı veya pasif.';
    END IF;

    -- 4. Temel Miktar ve Fiyat Kontrolleri
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Miktar 1 veya üzeri olmalıdır.';
    END IF;

    IF p_unit_price_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Birim fiyat negatif olamaz.';
    END IF;

    IF COALESCE(p_cost_price_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Ürün maliyeti negatif olamaz.';
    END IF;

    IF COALESCE(p_service_cost_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Teknik servis maliyeti negatif olamaz.';
    END IF;

    -- 5. Negatif Ödeme Tutarları Kontrolü
    IF COALESCE(p_cash_paid_kurus, 0) < 0 OR COALESCE(p_card_paid_kurus, 0) < 0 OR
       COALESCE(p_bank_transfer_paid_kurus, 0) < 0 OR COALESCE(p_credit_paid_kurus, 0) < 0 OR
       COALESCE(p_usd_paid_cents, 0) < 0 OR COALESCE(p_eur_paid_cents, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Ödeme tutarları negatif olamaz.';
    END IF;

    -- 6. Döviz Kur ve TL Karşılık Kontrolleri
    IF COALESCE(p_usd_paid_cents, 0) < 0 OR COALESCE(p_eur_paid_cents, 0) < 0 OR
       COALESCE(p_usd_tl_equivalent_kurus, 0) < 0 OR COALESCE(p_eur_tl_equivalent_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Döviz tutarları veya TL karşılıkları negatif olamaz.';
    END IF;

    IF COALESCE(p_usd_paid_cents, 0) = 0 AND COALESCE(p_usd_tl_equivalent_kurus, 0) <> 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Dolar ödenmediyse TL karşılığı 0 olmalıdır.';
    END IF;

    IF COALESCE(p_eur_paid_cents, 0) = 0 AND COALESCE(p_eur_tl_equivalent_kurus, 0) <> 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Euro ödenmediyse TL karşılığı 0 olmalıdır.';
    END IF;

    IF COALESCE(p_usd_paid_cents, 0) > 0 THEN
        IF p_usd_rate IS NULL OR p_usd_rate <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_KUR: Dolar ödemelerinde döviz kuru 0''dan büyük olmalıdır.';
        END IF;
        IF COALESCE(p_usd_tl_equivalent_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Dolar ödemesinde TL karşılığı 0''dan büyük olmalıdır.';
        END IF;
        v_expected_usd_tl := ROUND((p_usd_paid_cents::numeric / 100.0) * p_usd_rate * 100.0);
        IF ABS(p_usd_tl_equivalent_kurus - v_expected_usd_tl) > 1 THEN
            RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Dolar TL karşılığı (%.2f TL), girilen kur ve miktar ile hesaplanan tutarla (%.2f TL) uyuşmamaktadır (en fazla 1 kuruş yuvarlama toleransı kabul edilir).',
                (p_usd_tl_equivalent_kurus / 100.0), (v_expected_usd_tl / 100.0);
        END IF;
    END IF;

    IF COALESCE(p_eur_paid_cents, 0) > 0 THEN
        IF p_eur_rate IS NULL OR p_eur_rate <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_KUR: Euro ödemelerinde döviz kuru 0''dan büyük olmalıdır.';
        END IF;
        IF COALESCE(p_eur_tl_equivalent_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Euro ödemesinde TL karşılığı 0''dan büyük olmalıdır.';
        END IF;
        v_expected_eur_tl := ROUND((p_eur_paid_cents::numeric / 100.0) * p_eur_rate * 100.0);
        IF ABS(p_eur_tl_equivalent_kurus - v_expected_eur_tl) > 1 THEN
            RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Euro TL karşılığı (%.2f TL), girilen kur ve miktar ile hesaplanan tutarla (%.2f TL) uyuşmamaktadır (en fazla 1 kuruş yuvarlama toleransı kabul edilir).',
                (p_eur_tl_equivalent_kurus / 100.0), (v_expected_eur_tl / 100.0);
        END IF;
    END IF;

    -- 7. Kategoriye Göre Maliyet Ayrıştırması ve Tek Maliyet Kaynağı İlkesi
    IF v_category.name = 'Teknik Servis' THEN
        v_source_type := 'technical_service_fee';
        v_service_cost := COALESCE(p_service_cost_kurus, p_cost_price_kurus, 0);
        v_cost_price := 0; -- Çift sayımı önlemek için teknik servis satışında cost_price_kurus 0 sabitlenir
        v_pay_status := COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock');
    ELSE
        v_source_type := 'store_sale';
        v_service_cost := 0; -- Normal satışta teknik servis doğrudan maliyeti olamaz
        v_cost_price := COALESCE(p_cost_price_kurus, 0);
        v_pay_status := 'previously_paid_or_stock';
    END IF;

    IF v_service_cost > 0 AND v_pay_status NOT IN ('paid_from_cash', 'previously_paid_or_stock', 'unpaid') THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Teknik servis maliyeti ödeme durumu geçersizdir.';
    END IF;

    v_total_price := p_quantity * p_unit_price_kurus;

    -- 8. Ödeme Parçalarının Kuruşu Kuruşuna Eşitlik Kontrolü
    IF (COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_card_paid_kurus, 0) + COALESCE(p_bank_transfer_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0) + COALESCE(p_credit_paid_kurus, 0)) <> v_total_price THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Ödeme toplamı satılan ürün toplam fiyatına eşit olmalıdır.';
    END IF;

    -- 9. Havale/EFT Referans Temizliği, Karakter Limiti ve Formül/CSV Injection Koruması
    v_clean_ref := NULLIF(trim(p_bank_transfer_reference), '');
    IF v_clean_ref IS NOT NULL THEN
        IF length(v_clean_ref) > 200 THEN
            RAISE EXCEPTION 'GEÇERSİZ_REFERANS: Referans Numarası en fazla 200 karakter olabilir.';
        END IF;
        IF v_clean_ref ~ '^[=\+\-@]' THEN
            v_clean_ref := '''' || v_clean_ref;
        END IF;
    END IF;

    -- 10. TEKNİK SERVİS KASADAN MALİYET ÖDEMESİ KONTROLÜ (Satış anında giren nakit dahil edilir)
    IF v_service_cost > 0 AND v_pay_status = 'paid_from_cash' THEN
        v_current_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);
        v_cash_inflow_this_sale := COALESCE(p_cash_paid_kurus, 0);

        IF (v_current_cash + v_cash_inflow_this_sale - v_service_cost) < 0 THEN
            RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasadaki mevcut fiziki nakit ve bu satışın nakit tahsilatı toplamı (%.2f TL), kasadan ödenecek teknik servis maliyetini (%.2f TL) karşılamamaktadır.',
                ((v_current_cash + v_cash_inflow_this_sale) / 100.0), (v_service_cost / 100.0);
        END IF;
    END IF;

    -- 11. CARİ VERESİYE SATIŞ KONTROLLERİ
    IF COALESCE(p_credit_paid_kurus, 0) > 0 THEN
        IF p_credit_customer_id IS NULL THEN
            RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Cari veresiye satış için müşteri seçilmelidir.';
        END IF;

        SELECT * INTO v_customer FROM public.credit_customers WHERE id = p_credit_customer_id;
        IF v_customer.id IS NULL OR v_customer.status <> 'active' THEN
            RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Seçilen cari müşteri bulunamadı veya hesabı aktif değil.';
        END IF;

        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = p_credit_customer_id FOR UPDATE;
        IF v_account.id IS NULL OR v_account.status <> 'active' OR v_account.credit_limit <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_HESAP: Müşterinin onaylı aktif cari hesabı veya kullanılabilir limiti bulunmamaktadır.';
        END IF;

        IF (v_account.current_balance + (p_credit_paid_kurus / 100.0)) > v_account.credit_limit THEN
            RAISE EXCEPTION 'LİMİT_AŞIMI: İşlem sonrası toplam cari borç (%.2f TL), belirlenen limiti (%.2f TL) aşamaz.',
                (v_account.current_balance + (p_credit_paid_kurus / 100.0)), v_account.credit_limit;
        END IF;

        IF v_total_price > 0 THEN
            v_uncollected_cost := ROUND((v_cost_price * p_quantity * p_credit_paid_kurus)::numeric / v_total_price::numeric);
        END IF;
    END IF;

    -- 12. STRICT IDEMPOTENCY KONTROLÜ (Tüm 18 Finansal/Kimlik Alanı Karşılaştırılır)
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.created_by_user_id IS DISTINCT FROM p_actor_user_id OR
               v_existing.kasa_day_id IS DISTINCT FROM p_kasa_day_id OR
               v_existing.category_id IS DISTINCT FROM p_category_id OR
               v_existing.product_name IS DISTINCT FROM p_product_name OR
               v_existing.quantity IS DISTINCT FROM p_quantity OR
               v_existing.unit_price_kurus IS DISTINCT FROM p_unit_price_kurus OR
               v_existing.total_price_kurus IS DISTINCT FROM v_total_price OR
               v_existing.cash_paid_kurus IS DISTINCT FROM COALESCE(p_cash_paid_kurus, 0) OR
               v_existing.card_paid_kurus IS DISTINCT FROM COALESCE(p_card_paid_kurus, 0) OR
               v_existing.bank_transfer_paid_kurus IS DISTINCT FROM COALESCE(p_bank_transfer_paid_kurus, 0) OR
               v_existing.usd_paid_cents IS DISTINCT FROM COALESCE(p_usd_paid_cents, 0) OR
               v_existing.usd_tl_equivalent_kurus IS DISTINCT FROM COALESCE(p_usd_tl_equivalent_kurus, 0) OR
               v_existing.eur_paid_cents IS DISTINCT FROM COALESCE(p_eur_paid_cents, 0) OR
               v_existing.eur_tl_equivalent_kurus IS DISTINCT FROM COALESCE(p_eur_tl_equivalent_kurus, 0) OR
               v_existing.credit_paid_kurus IS DISTINCT FROM COALESCE(p_credit_paid_kurus, 0) OR
               v_existing.credit_customer_id IS DISTINCT FROM p_credit_customer_id OR
               v_existing.service_cost_kurus IS DISTINCT FROM v_service_cost OR
               v_existing.service_cost_payment_status IS DISTINCT FROM v_pay_status
            THEN
                RAISE EXCEPTION 'GEÇERSİZ_İDEMPOTENCY: Aynı idempotency key ile farklı satış isteği gönderilemez.';
            END IF;
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    v_receipt_no := 'FS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.kasa_receipt_seq')::text, 5, '0');

    -- 1. Satış Kaydı Oluştur
    INSERT INTO public.kasa_sales (
        kasa_day_id, category_id, product_name, brand, model, product_code, quantity,
        unit_price_kurus, cost_price_kurus, service_cost_kurus, service_cost_payment_status,
        service_cost_paid_at, service_cost_paid_by_user_id,
        total_price_kurus, cash_paid_kurus, card_paid_kurus,
        bank_transfer_paid_kurus, bank_transfer_reference,
        usd_paid_cents, usd_rate, usd_tl_equivalent_kurus, eur_paid_cents, eur_rate, eur_tl_equivalent_kurus,
        credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus, credit_customer_id, credit_account_id,
        receipt_no, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_category_id, p_product_name, p_brand, p_model, p_product_code, p_quantity,
        p_unit_price_kurus, v_cost_price, v_service_cost, v_pay_status,
        CASE WHEN v_pay_status = 'paid_from_cash' THEN NOW() ELSE NULL END,
        CASE WHEN v_pay_status = 'paid_from_cash' THEN p_actor_user_id ELSE NULL END,
        v_total_price, p_cash_paid_kurus, p_card_paid_kurus,
        p_bank_transfer_paid_kurus, v_clean_ref,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
        p_credit_paid_kurus, p_credit_paid_kurus, v_uncollected_cost, p_credit_customer_id, v_account.id,
        v_receipt_no, p_description, p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_sale;

    -- 2. Kasa Hareket Kaydı (Satış)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'satis', v_sale.id, v_total_price, p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus,
        'Satış (' || v_receipt_no || '): ' || p_product_name, p_actor_user_id
    );

    -- 3. Teknik Servis Nakit Maliyet Ödemesi Hareketi (paid_from_cash ise tek transaction içinde yazılır)
    IF v_service_cost > 0 AND v_pay_status = 'paid_from_cash' THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'ts_cost_cash_payment', v_sale.id, -v_service_cost, -v_service_cost, 0,
            'Teknik Servis Nakit Maliyet Ödemesi (' || v_receipt_no || '): ' || p_product_name, p_actor_user_id
        );
    END IF;

    -- 4. Döviz Kasası İşlemleri
    IF p_usd_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = usd_balance_cents + p_usd_paid_cents,
            usd_cost_pool_kurus = usd_cost_pool_kurus + p_usd_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'USD', p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    IF p_eur_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            eur_balance_cents = eur_balance_cents + p_eur_paid_cents,
            eur_cost_pool_kurus = eur_cost_pool_kurus + p_eur_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'EUR', p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    -- 5. Cari Hesap Güncellemesi ve Reversal / Purchase Kaydı
    IF p_credit_paid_kurus > 0 THEN
        v_new_balance := v_account.current_balance + (p_credit_paid_kurus / 100.0);
        UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

        v_trans_code := 'PUR-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

        INSERT INTO public.credit_transactions (
            transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
            amount, description, source_type, source_reference, admin_username, balance_after
        ) VALUES (
            v_trans_code, p_credit_customer_id, v_account.id, 'purchase', 'debit',
            (p_credit_paid_kurus / 100.0), 'Kasa İçi Veresiye Satış: ' || p_product_name || ' (' || v_receipt_no || ')',
            v_source_type, v_sale.id::text, v_actor.username, v_new_balance
        );
    END IF;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_yapildi', 'kasa_sales', v_sale.id, jsonb_build_object(
        'receipt_no', v_receipt_no,
        'total_price_kurus', v_total_price,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus,
        'service_cost_kurus', v_service_cost,
        'service_cost_payment_status', v_pay_status
    ));

    RETURN to_jsonb(v_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT, TEXT
) TO service_role;

-- 24 PARAMS GERİYE DÖNÜK UYUMLULUK WRAPPER FONKSİYONU (DEFAULT YOKTUR)
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT
);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_paid_kurus BIGINT,
    p_credit_customer_id UUID,
    p_brand TEXT,
    p_model TEXT,
    p_product_code TEXT,
    p_description TEXT,
    p_idempotency_key TEXT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_create_sale(
        p_actor_user_id, p_kasa_day_id, p_category_id, p_product_name, p_quantity,
        p_unit_price_kurus, p_cost_price_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents,
        p_eur_rate, p_eur_tl_equivalent_kurus, p_credit_paid_kurus, p_credit_customer_id,
        p_brand, p_model, p_product_code, p_description, p_idempotency_key,
        p_bank_transfer_paid_kurus, p_bank_transfer_reference,
        NULL, 'previously_paid_or_stock'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
    NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT,
    TEXT, TEXT, TEXT, BIGINT, TEXT
) TO service_role;


-- 7. SECURE RPC: SATIŞ DÜZELTME (TEKNİK SERVİS DOĞRUDAN MALİYET VE NAKİT HAREKETİ DÜZENLEMESİ İLE - 26 PARAMS - DEFAULT YOKTUR)

DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
);

DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT
);

CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_paid_kurus BIGINT,
    p_credit_customer_id UUID,
    p_justification TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_serial_imei TEXT,
    p_description TEXT,
    p_cost_price_kurus BIGINT,
    p_service_cost_kurus BIGINT,
    p_service_cost_payment_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_categories%ROWTYPE;
    v_updated_sale public.kasa_sales%ROWTYPE;
    v_total_price_kurus BIGINT;
    v_portions_sum BIGINT;
    v_current_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
    v_old_ts_cash_cost BIGINT := 0;
    v_new_ts_cash_cost BIGINT := 0;
    v_ts_cash_diff BIGINT := 0;
    v_new_pay_status TEXT;
    v_new_cost_price BIGINT := 0;
    v_new_service_cost BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satış bulunamadı veya değiştirilebilir durumda değil (iptal/iade edilmiş).';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait satışlar değiştirilemez.';
    END IF;

    IF v_actor.role <> 'yonetici' AND v_sale.created_by_user_id <> p_actor_user_id THEN
        RAISE EXCEPTION 'YETKİSİZ: Personel yalnızca kendi oluşturduğu satışları düzeltebilir.';
    END IF;

    IF v_sale.credit_paid_kurus > 0 OR COALESCE(p_credit_paid_kurus, 0) > 0 OR
       v_sale.usd_paid_cents > 0 OR COALESCE(p_usd_paid_cents, 0) > 0 OR
       v_sale.eur_paid_cents > 0 OR COALESCE(p_eur_paid_cents, 0) > 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Cari/veresiye veya döviz içeren satışlar güvenlik nedeniyle doğrudan düzeltilemez. Yönetici tarafından iptal edilerek yeniden oluşturulmalıdır.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_categories WHERE id = p_category_id;
    IF v_category.id IS NULL OR NOT v_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen satış kategorisi bulunamadı veya pasif.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Satış düzeltme gerekçesi zorunludur.';
    END IF;

    IF p_product_name IS NULL OR trim(p_product_name) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Ürün adı boş olamaz.';
    END IF;

    IF p_quantity <= 0 OR p_unit_price_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Miktar 1 veya üzeri, birim fiyat 0 veya üzeri olmalıdır.';
    END IF;

    v_total_price_kurus := p_quantity * p_unit_price_kurus;
    v_portions_sum := COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_card_paid_kurus, 0) + COALESCE(p_bank_transfer_paid_kurus, 0) + COALESCE(p_credit_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0);

    IF v_total_price_kurus <> v_portions_sum THEN
        RAISE EXCEPTION 'GEÇERSİZ_ÖDEME: Satış toplam tutarı (% TL) ödeme yöntemlerinin toplamına (% TL) eşit olmalıdır.', (v_total_price_kurus / 100.0), (v_portions_sum / 100.0);
    END IF;

    IF v_category.name = 'Teknik Servis' THEN
        v_new_service_cost := COALESCE(p_service_cost_kurus, p_cost_price_kurus, 0);
        v_new_cost_price := 0;
    ELSE
        v_new_service_cost := 0;
        v_new_cost_price := COALESCE(p_cost_price_kurus, 0);
    END IF;

    v_new_pay_status := COALESCE(p_service_cost_payment_status, v_sale.service_cost_payment_status, 'previously_paid_or_stock');

    -- Eski ve Yeni Teknik Servis Nakit Maliyet Tutarını Hesapla
    IF v_sale.service_cost_payment_status = 'paid_from_cash' THEN
        v_old_ts_cash_cost := COALESCE(v_sale.service_cost_kurus, 0);
    END IF;

    IF v_new_pay_status = 'paid_from_cash' THEN
        v_new_ts_cash_cost := v_new_service_cost;
    END IF;

    v_ts_cash_diff := v_old_ts_cash_cost - v_new_ts_cash_cost;

    -- Fiziki Nakit Bakiyesini fn_kasa_get_physical_cash İle Kontrol Et
    v_current_cash := public.fn_kasa_get_physical_cash(v_sale.kasa_day_id);
    v_cash_diff := (COALESCE(p_cash_paid_kurus, 0) - v_sale.cash_paid_kurus) + v_ts_cash_diff;

    IF (v_current_cash + v_cash_diff) < 0 THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Satış düzeltmesi sonrasında kasa fiziki nakit bakiyesi eksiye düşeceği için işlem reddedildi (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    -- TERS KAYIT: Eski satışın cirosu
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'satis_duzeltme_iptal', p_sale_id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
        'Satış Düzeltme İptali (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
    );

    -- YENİ KAYIT: Düzeltilmiş satışın cirosu
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'satis_duzeltme_yeni', p_sale_id, v_total_price_kurus, COALESCE(p_cash_paid_kurus, 0), COALESCE(p_card_paid_kurus, 0), COALESCE(p_bank_transfer_paid_kurus, 0),
        'Satış Düzeltme (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
    );

    -- TEKNİK SERVİS NAKİT MALİYET HAREKETLERİNİN DÜZELTİLMESİ
    IF v_old_ts_cash_cost > 0 THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'ts_cost_cash_refund', p_sale_id, v_old_ts_cash_cost, v_old_ts_cash_cost, 0,
            'Teknik Servis Maliyet Düzeltme İadesi (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
        );
    END IF;

    IF v_new_ts_cash_cost > 0 THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'ts_cost_cash_payment', p_sale_id, -v_new_ts_cash_cost, -v_new_ts_cash_cost, 0,
            'Teknik Servis Maliyet Düzeltme Ödemesi (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
        );
    END IF;

    -- SATIŞ TABLOSUNU GÜNCELLE
    UPDATE public.kasa_sales SET
        category_id = p_category_id,
        product_name = trim(p_product_name),
        quantity = p_quantity,
        unit_price_kurus = p_unit_price_kurus,
        total_price_kurus = v_total_price_kurus,
        cash_paid_kurus = COALESCE(p_cash_paid_kurus, 0),
        card_paid_kurus = COALESCE(p_card_paid_kurus, 0),
        bank_transfer_paid_kurus = COALESCE(p_bank_transfer_paid_kurus, 0),
        bank_transfer_reference = p_bank_transfer_reference,
        usd_paid_cents = COALESCE(p_usd_paid_cents, 0),
        usd_rate = p_usd_rate,
        usd_tl_equivalent_kurus = COALESCE(p_usd_tl_equivalent_kurus, 0),
        eur_paid_cents = COALESCE(p_eur_paid_cents, 0),
        eur_rate = p_eur_rate,
        eur_tl_equivalent_kurus = COALESCE(p_eur_tl_equivalent_kurus, 0),
        credit_paid_kurus = COALESCE(p_credit_paid_kurus, 0),
        credit_customer_id = p_credit_customer_id,
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        serial_imei = p_serial_imei,
        description = p_description,
        cost_price_kurus = v_new_cost_price,
        service_cost_kurus = v_new_service_cost,
        service_cost_payment_status = v_new_pay_status,
        service_cost_paid_at = CASE WHEN v_new_pay_status = 'paid_from_cash' THEN NOW() ELSE service_cost_paid_at END,
        service_cost_paid_by_user_id = CASE WHEN v_new_pay_status = 'paid_from_cash' THEN p_actor_user_id ELSE service_cost_paid_by_user_id END
    WHERE id = p_sale_id
    RETURNING * INTO v_updated_sale;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_duzeltildi', 'kasa_sales', p_sale_id, jsonb_build_object(
        'receipt_no', v_sale.receipt_no,
        'justification', trim(p_justification),
        'old_total_kurus', v_sale.total_price_kurus,
        'new_total_kurus', v_total_price_kurus,
        'service_cost_payment_status', v_new_pay_status
    ));

    RETURN to_jsonb(v_updated_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT
) TO service_role;


-- 8. SECURE RPC: SATIŞ İPTALİ (CARİ REVERSAL + HAVALE/EFT + TEKNİK SERVİS MALİYET İADESİ - 4 PARAMS - DEFAULT YOKTUR)

DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT,
    p_cost_refunded BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_uncollected_credit BIGINT;
    v_new_balance NUMERIC;
    v_trans_code TEXT;
    v_cancelled_sale public.kasa_sales%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Yalnızca yöneticiler satış iptali yapabilir.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: İptal gerekçesi girmek zorunludur.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: İptal edilecek tamamlanmış satış bulunamadı veya zaten iptal edilmiş.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satışın ait olduğu kasa günü açık değil.';
    END IF;

    -- 1. CARİ SATIŞ İPTALİ REVERSAL İŞLEMLERİ
    IF v_sale.credit_customer_id IS NOT NULL AND v_sale.uncollected_credit_kurus > 0 THEN
        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = v_sale.credit_customer_id FOR UPDATE;
        IF v_account.id IS NOT NULL THEN
            v_uncollected_credit := v_sale.uncollected_credit_kurus;
            v_new_balance := GREATEST(v_account.current_balance - (v_uncollected_credit / 100.0), 0);

            UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

            v_trans_code := 'REV-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

            INSERT INTO public.credit_transactions (
                transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
                amount, description, source_type, source_reference, admin_username, balance_after
            ) VALUES (
                v_trans_code, v_sale.credit_customer_id, v_account.id, 'reversal', 'credit',
                (v_uncollected_credit / 100.0), 'Kasa Satış İptali: ' || v_sale.receipt_no || ' (Gerekçe: ' || trim(p_justification) || ')',
                'reversal', v_sale.id::text, v_actor.username, v_new_balance
            );
        END IF;
    END IF;

    -- 2. Satış Durumunu 'cancelled' Yap ve Açıklamaya Ekle
    UPDATE public.kasa_sales SET
        status = 'cancelled',
        description = COALESCE(description, '') || ' [İPTAL GEREKÇESİ: ' || trim(p_justification) || ']',
        uncollected_credit_kurus = 0,
        uncollected_cost_kurus = 0,
        cost_refunded_on_cancel = CASE WHEN v_sale.service_cost_payment_status = 'paid_from_cash' THEN COALESCE(p_cost_refunded, false) ELSE false END
    WHERE id = p_sale_id
    RETURNING * INTO v_cancelled_sale;

    -- 3. Kasa Hareket Kaydı (Satış İptali Ciro Düşüşü)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'iptal', p_sale_id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
        'Satış İptali (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
    );

    -- 4. TEKNİK SERVİS MALİYET İADESİ KASAYA GİRİŞİ (paid_from_cash ve p_cost_refunded = true ise)
    IF v_sale.service_cost_payment_status = 'paid_from_cash' AND COALESCE(v_sale.service_cost_kurus, 0) > 0 AND p_cost_refunded = true THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'ts_cost_cash_refund', p_sale_id, v_sale.service_cost_kurus, v_sale.service_cost_kurus, 0,
            'Teknik Servis Maliyet İadesi Kasaya Giriş (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
        );
    END IF;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_iptal_edildi', 'kasa_sales', p_sale_id, jsonb_build_object(
        'receipt_no', v_sale.receipt_no,
        'justification', trim(p_justification),
        'cost_refunded', COALESCE(p_cost_refunded, false)
    ));

    RETURN to_jsonb(v_cancelled_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN) TO service_role;

-- 3 PARAMS GERİYE DÖNÜK UYUMLULUK WRAPPER FONKSİYONU (DEFAULT YOKTUR)
CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_cancel_sale(p_actor_user_id, p_sale_id, p_justification, false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) TO service_role;


-- 9. BANKAYA NAKİT ÇIKIŞI VE GÜN SONU KAPANIŞ RPC'LERİNİN GÜNCELLENMESİ

DROP FUNCTION IF EXISTS public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_deposit_to_bank(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_bank_name TEXT,
    p_reference_no TEXT,
    p_description TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_current_cash BIGINT := 0;
    v_deposit public.kasa_bank_deposits%ROWTYPE;
    v_existing public.kasa_bank_deposits%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Bankaya nakit yatırma işlemi yalnızca yöneticilere aittir.';
    END IF;
    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Yatırılacak tutar 0 veya negatif olamaz.';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_bank_deposits WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    v_current_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bankaya çıkılacak yeterli fiziki TL nakit yok (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    INSERT INTO public.kasa_bank_deposits (
        kasa_day_id, amount_kurus, bank_name, reference_no, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_amount_kurus, p_bank_name, p_reference_no, COALESCE(p_description, 'Bankaya Yatırılan Nakit'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_deposit;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'bank_deposit', -p_amount_kurus, -p_amount_kurus, 0,
        'Bankaya Yatırılan Nakit (' || COALESCE(p_bank_name, 'Banka') || ')', p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'bankaya_yatirildi', 'kasa_bank_deposits', v_deposit.id, jsonb_build_object('amount_kurus', p_amount_kurus, 'bank_name', p_bank_name));

    RETURN to_jsonb(v_deposit);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) TO service_role;


DROP FUNCTION IF EXISTS public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.fn_kasa_close_day(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_counted_cash_kurus BIGINT,
    p_closing_note TEXT,
    p_counted_usd_cents BIGINT,
    p_counted_eur_cents BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_expected_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
    v_usd_diff BIGINT := 0;
    v_eur_diff BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı oturumu geçersiz.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Gün sonu kapatma yetkisi yalnızca yöneticilere aittir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Kasa günü bulunamadı.';
    END IF;
    IF v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kasa günü zaten kapalı.';
    END IF;

    v_expected_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);
    v_cash_diff := p_counted_cash_kurus - v_expected_cash;

    IF p_counted_usd_cents IS NOT NULL THEN
        v_usd_diff := p_counted_usd_cents - v_day.usd_balance_cents;
    END IF;

    IF p_counted_eur_cents IS NOT NULL THEN
        v_eur_diff := p_counted_eur_cents - v_day.eur_balance_cents;
    END IF;

    UPDATE public.kasa_days SET
        status = 'closed',
        closed_at = now(),
        closed_by_user_id = p_actor_user_id,
        closing_balance_kurus = p_counted_cash_kurus,
        expected_balance_kurus = v_expected_cash,
        cash_difference_kurus = v_cash_diff,
        closing_note = p_closing_note,
        counted_usd_cents = COALESCE(p_counted_usd_cents, v_day.usd_balance_cents),
        usd_difference_cents = v_usd_diff,
        counted_eur_cents = COALESCE(p_counted_eur_cents, v_day.eur_balance_cents),
        eur_difference_cents = v_eur_diff
    WHERE id = p_kasa_day_id;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'gun_sonu_kapanis', p_counted_cash_kurus, p_counted_cash_kurus, 0,
        'Gün Sonu Kapanış Sayımı (Fark: ' || (v_cash_diff / 100.0) || ' TL)', p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gun_kapatildi', 'kasa_days', p_kasa_day_id, jsonb_build_object('expected_cash', v_expected_cash, 'counted_cash', p_counted_cash_kurus, 'diff', v_cash_diff));

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id;
    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) TO service_role;

COMMIT;
