-- ============================================================================
-- HurCELL Kasa V21 Rollback - Gece Yarısı Rollover İyileştirmesini Geri Alma
-- Description: fn_kasa_assert_active_day_for_mutation ve fn_kasa_get_or_create_open_day fonksiyonlarını V20 öncesi durumuna döndürür.
-- KORUMA: Hiçbir finansal kaydı, satış/gideri veya audit geçmişini silmez.
--         Sahte/doğrulanmamış UUID kullanmaz; aktif yönetici üzerinden audit kaydı düşer.
-- ============================================================================

BEGIN;

-- 1. fn_kasa_assert_active_day_for_mutation fonksiyonunu eski durumuna geri yükle
CREATE OR REPLACE FUNCTION public.fn_kasa_assert_active_day_for_mutation(
    p_kasa_day_id UUID
)
RETURNS public.kasa_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_day public.kasa_days%ROWTYPE;
    v_today_ist DATE;
BEGIN
    IF p_kasa_day_id IS NULL THEN
        RAISE EXCEPTION 'KASA_GUNU_BULUNAMADI: Geçerli bir kasa günü belirtilmelidir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'KASA_GUNU_BULUNAMADI: Belirtilen kasa günü bulunamadı.';
    END IF;

    IF v_day.status <> 'open' THEN
        RAISE EXCEPTION 'KASA_GUNU_KAPALI: Finansal işlem yalnızca açık kasa gününde yapılabilir.';
    END IF;

    v_today_ist := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date;

    IF v_day.date_val <> v_today_ist THEN
        RAISE EXCEPTION 'KASA_GUNU_TARIH_UYUSMAZLIGI: Kasa günü tarihi (%) bugünün İstanbul tarihi (%) ile uyuşmuyor. Lütfen açık günü kapatıp bugünün gününü açınız.',
            v_day.date_val, v_today_ist;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.kasa_days
        WHERE status = 'open' AND date_val < v_day.date_val
    ) THEN
        RAISE EXCEPTION 'ONCEKI_KASA_GUNU_KAPATILMADI: Önceki tarihlere ait açık kasa günü kapatılmadan yeni gün işlemi yapılamaz.';
    END IF;

    RETURN v_day;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) TO service_role;


-- 2. fn_kasa_get_or_create_open_day fonksiyonunu eski durumuna geri yükle
CREATE OR REPLACE FUNCTION public.fn_kasa_get_or_create_open_day(
    p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today DATE;
    v_day public.kasa_days%ROWTYPE;
    v_unclosed_day public.kasa_days%ROWTYPE;
    v_prev_closed_day public.kasa_days%ROWTYPE;
    v_actor public.kasa_users%ROWTYPE;
    v_opening_balance BIGINT := 0;
    v_usd_balance BIGINT := 0;
    v_usd_cost_pool BIGINT := 0;
    v_eur_balance BIGINT := 0;
    v_eur_cost_pool BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    v_today := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;

    PERFORM pg_advisory_xact_lock(hashtext('kasa_day_open_' || v_today::text));

    SELECT * INTO v_unclosed_day
    FROM public.kasa_days
    WHERE status = 'open' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_unclosed_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'PREVIOUS_DAY_UNCLOSED: % tarihli kasa günü henüz kapatılmamış. Lütfen öncelikle gün sonu sayımını yaparak önceki günü kapatın.', to_char(v_unclosed_day.date_val, 'YYYY-MM-DD');
    END IF;

    SELECT * INTO v_prev_closed_day
    FROM public.kasa_days
    WHERE status = 'closed' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_prev_closed_day.id IS NOT NULL THEN
        v_opening_balance := COALESCE(v_prev_closed_day.counted_cash_kurus, 0);
        v_usd_balance := COALESCE(v_prev_closed_day.counted_usd_cents, v_prev_closed_day.usd_balance_cents, 0);
        v_usd_cost_pool := COALESCE(v_prev_closed_day.usd_cost_pool_kurus, 0);
        v_eur_balance := COALESCE(v_prev_closed_day.counted_eur_cents, v_prev_closed_day.eur_balance_cents, 0);
        v_eur_cost_pool := COALESCE(v_prev_closed_day.eur_cost_pool_kurus, 0);
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
    IF v_day.id IS NOT NULL THEN
        RETURN to_jsonb(v_day);
    END IF;

    BEGIN
        INSERT INTO public.kasa_days (
            date_val, status, opening_balance_kurus, usd_balance_cents, usd_cost_pool_kurus, eur_balance_cents, eur_cost_pool_kurus, opened_by_user_id
        ) VALUES (
            v_today, 'open', v_opening_balance, v_usd_balance, v_usd_cost_pool, v_eur_balance, v_eur_cost_pool, p_actor_user_id
        ) RETURNING * INTO v_day;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
        RETURN to_jsonb(v_day);
    END;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_day.id, 'acilis_bakiyesi', v_opening_balance, 0, 0,
        'Kasa Açılışı / Önceki Gün Devri' || CASE WHEN v_prev_closed_day.id IS NOT NULL THEN ' (Kaynak: ' || v_prev_closed_day.date_val || ')' ELSE '' END,
        p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_acildi', 'kasa_days', v_day.id,
        jsonb_build_object('opening_balance_kurus', v_opening_balance, 'source_day_id', v_prev_closed_day.id, 'source_date', v_prev_closed_day.date_val)
    );

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) TO service_role;

-- 3. Güvenli Rollback Audit Log Kaydı
DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
        INSERT INTO public.kasa_audit_logs (
            user_id, action, entity_type, entity_id, details, justification
        ) VALUES (
            v_admin_id,
            'rollback_applied',
            'kasa_functions',
            v_admin_id,
            jsonb_build_object(
                'version', 'V21',
                'restored_functions', ARRAY['fn_kasa_assert_active_day_for_mutation(UUID)', 'fn_kasa_get_or_create_open_day(UUID)'],
                'rollback_timestamp', now()
            ),
            'HurCELL Kasa V21 Rollback: V21 fonksiyonları geri alındı.'
        );
    END IF;
END;
$$;

COMMIT;
