-- Migration: 20260823183000_kasa_missing_finance_rpcs.sql
-- Description: HurCELL Kasa Föyü Eksik Finansal RPC Fonksiyonları (Sermaye Girişi, İşletme Sahibi Çekimi, Gider/Maaş Kaydı ve Hedef Rezerv Güncelleme)

BEGIN;

-- 1. PRECONDITION CHECKS
DO $$
BEGIN
  IF to_regclass('public.kasa_days') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_days table does not exist; foundation migration must run first';
  END IF;
  IF to_regclass('public.kasa_expenses') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_expenses table does not exist; foundation migration must run first';
  END IF;
END $$;

-- 2. SECURE ATOMIC SECURITY DEFINER RPC: SERMAYE GİRİŞİ (YÖNETİCİ)
DROP FUNCTION IF EXISTS public.fn_kasa_inject_capital(UUID, UUID, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_inject_capital(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Sermaye girişi yalnızca yöneticilere aittir.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Eklenen sermaye tutarı 0 veya negatif olamaz.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    -- Kasa gününe sermayeyi ekle (Satış/Gelir sayılmaz)
    UPDATE public.kasa_days SET
        capital_injected_kurus = capital_injected_kurus + p_amount_kurus
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    -- Kasa Hareket Kaydı
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'capital_injection', p_amount_kurus, p_amount_kurus, 0,
        COALESCE(p_description, 'Sermaye Girişi'), p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'sermaye_eklendi', 'kasa_days', p_kasa_day_id, jsonb_build_object('amount_kurus', p_amount_kurus, 'description', p_description));

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_inject_capital(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_inject_capital(UUID, UUID, BIGINT, TEXT) TO service_role;

-- 3. SECURE ATOMIC SECURITY DEFINER RPC: İŞLETME SAHİBİ ÇEKİMİ (YÖNETİCİ)
DROP FUNCTION IF EXISTS public.fn_kasa_withdraw_owner(UUID, UUID, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_withdraw_owner(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_total_cash_sales BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_current_cash BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: İşletme sahibi çekimi yalnızca yöneticilere aittir.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Çekim tutarı 0 veya negatif olamaz.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: İşletme sahibi çekimi için açıklama/gerekçe zorunludur.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_current_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada işletme sahibi çekimi için yeterli fiziki TL nakit bulunmamaktadır (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    -- Kasa gününden nakit çek (Gider/Maaş sayılmaz)
    UPDATE public.kasa_days SET
        owner_withdrawn_kurus = owner_withdrawn_kurus + p_amount_kurus
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'owner_withdrawal', -p_amount_kurus, -p_amount_kurus, 0,
        'İşletme Sahibi Çekimi: ' || p_justification, p_justification, p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, justification, details)
    VALUES (p_actor_user_id, 'isletme_sahibi_cekimi', 'kasa_days', p_kasa_day_id, p_justification, jsonb_build_object('amount_kurus', p_amount_kurus));

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_withdraw_owner(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_withdraw_owner(UUID, UUID, BIGINT, TEXT) TO service_role;

-- 4. SECURE ATOMIC SECURITY DEFINER RPC: GİDER / MAAŞ KAYDI OLUŞTURMA (YÖNETİCİ)
DROP FUNCTION IF EXISTS public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_expense_category_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT,
    p_recipient_name TEXT DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL
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
    v_total_cash_sales BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_current_cash BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Gider kaydı ekleme yalnızca yöneticilere aittir.';
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

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_current_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bu gider ödemesini karşılayacak kadar fiziki TL nakit bulunmamaktadır (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    IF v_category.is_salary_category = true THEN
        v_movement_type := 'salary_payment';
    END IF;

    -- 1. Gider Kaydı Oluştur
    INSERT INTO public.kasa_expenses (
        kasa_day_id, expense_category_id, sale_id, amount_kurus, description, recipient_name, created_by_user_id
    ) VALUES (
        p_kasa_day_id, p_expense_category_id, p_sale_id, p_amount_kurus, trim(p_description), p_recipient_name, p_actor_user_id
    ) RETURNING * INTO v_expense;

    -- 2. Kasa Hareket Kaydı
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

-- 5. SECURE ATOMIC SECURITY DEFINER RPC: HEDEF KASA REZERVİ GÜNCELLEME (YÖNETİCİ)
DROP FUNCTION IF EXISTS public.fn_kasa_update_target_reserve(UUID, BIGINT);

CREATE OR REPLACE FUNCTION public.fn_kasa_update_target_reserve(
    p_actor_user_id UUID,
    p_target_kurus BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_settings public.kasa_settings%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Hedef kasa bakiyesi güncelleme yalnızca yöneticilere aittir.';
    END IF;

    IF p_target_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Hedef kasa bakiyesi negatif olamaz.';
    END IF;

    SELECT * INTO v_settings FROM public.kasa_settings LIMIT 1 FOR UPDATE;

    IF v_settings.id IS NULL THEN
        INSERT INTO public.kasa_settings (cash_reserve_target_kurus, updated_by_user_id)
        VALUES (p_target_kurus, p_actor_user_id)
        RETURNING * INTO v_settings;
    ELSE
        UPDATE public.kasa_settings SET
            cash_reserve_target_kurus = p_target_kurus,
            updated_by_user_id = p_actor_user_id,
            updated_at = now()
        WHERE id = v_settings.id
        RETURNING * INTO v_settings;
    END IF;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'hedef_bakiye_guncellendi', 'kasa_settings', v_settings.id, jsonb_build_object('target_kurus', p_target_kurus));

    RETURN to_jsonb(v_settings);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_target_reserve(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_target_reserve(UUID, BIGINT) TO service_role;

COMMIT;
