BEGIN;

CREATE OR REPLACE FUNCTION public.fn_kasa_close_day(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_counted_cash_kurus BIGINT,
    p_closing_note TEXT DEFAULT NULL,
    p_counted_usd_cents BIGINT DEFAULT NULL,
    p_counted_eur_cents BIGINT DEFAULT NULL
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
    -- Concurrent close protection
    LOCK TABLE public.kasa_days IN SHARE ROW EXCLUSIVE MODE;

    -- Aktif kullanıcı doğrulama: Hem yonetici hem de personel rollerine izin verilir
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role NOT IN ('yonetici', 'personel') THEN
        RAISE EXCEPTION 'YETKİSİZ: Gün sonu kapatma işlemi yalnızca aktif kullanıcılar (Yönetici veya Personel) tarafından yapılabilir.';
    END IF;

    -- TL Nakit kontrolü
    IF p_counted_cash_kurus IS NULL OR p_counted_cash_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sayılan nakit tutarı negatif olamaz.';
    END IF;

    -- Negatif USD kontrolü
    IF p_counted_usd_cents IS NOT NULL AND p_counted_usd_cents < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sayılan USD tutarı negatif olamaz.';
    END IF;

    -- Negatif EUR kontrolü
    IF p_counted_eur_cents IS NOT NULL AND p_counted_eur_cents < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sayılan EUR tutarı negatif olamaz.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Kasa günü bulunamadı.';
    END IF;

    IF v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Bu kasa günü zaten kapatılmış.';
    END IF;

    -- TARİH SIRASI ZORUNLULUĞU KONTROLÜ: Hedef tarihten daha eski herhangi bir açık kasa günü varsa kapatma engellenir
    IF EXISTS (
        SELECT 1
        FROM public.kasa_days
        WHERE status = 'open'
          AND date_val < v_day.date_val
          AND id <> p_kasa_day_id
    ) THEN
        RAISE EXCEPTION 'OLDER_OPEN_DAY_EXISTS: Daha eski açık kasa günü kapatılmadan bu gün kapatılamaz.';
    END IF;

    v_expected_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);
    v_cash_diff := p_counted_cash_kurus - v_expected_cash;

    IF p_counted_usd_cents IS NOT NULL THEN
        v_usd_diff := p_counted_usd_cents - COALESCE(v_day.usd_balance_cents, 0);
    END IF;

    IF p_counted_eur_cents IS NOT NULL THEN
        v_eur_diff := p_counted_eur_cents - COALESCE(v_day.eur_balance_cents, 0);
    END IF;

    -- Fark varsa açıklama zorunluluğu
    IF (v_cash_diff <> 0 OR v_usd_diff <> 0 OR v_eur_diff <> 0) AND (p_closing_note IS NULL OR trim(p_closing_note) = '') THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Kasada nakit veya döviz farkı bulunduğu için kapanış notu / gerekçesi belirtilmesi zorunludur.';
    END IF;

    UPDATE public.kasa_days SET
        status = 'closed',
        closed_at = now(),
        closed_by_user_id = p_actor_user_id,
        expected_cash_kurus = v_expected_cash,
        counted_cash_kurus = p_counted_cash_kurus,
        cash_difference_kurus = v_cash_diff,
        closing_note = trim(p_closing_note),
        counted_usd_cents = COALESCE(p_counted_usd_cents, v_day.usd_balance_cents),
        usd_difference_cents = v_usd_diff,
        counted_eur_cents = COALESCE(p_counted_eur_cents, v_day.eur_balance_cents),
        eur_difference_cents = v_eur_diff
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    BEGIN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'gun_sonu_kapanis', p_counted_cash_kurus, 0, 0,
            'Gün Sonu Kapanış Sayımı (Sayılan: ' || (p_counted_cash_kurus / 100.0) || ' TL, Beklenen: ' || (v_expected_cash / 100.0) || ' TL, Fark: ' || (v_cash_diff / 100.0) || ' TL)',
            p_actor_user_id
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_kapatildi', 'kasa_days', p_kasa_day_id,
        jsonb_build_object(
            'expected_cash_kurus', v_expected_cash,
            'counted_cash_kurus', p_counted_cash_kurus,
            'cash_difference_kurus', v_cash_diff,
            'closing_note', p_closing_note,
            'actor_role', v_actor.role
        )
    );

    RETURN to_jsonb(v_day);
END;
$$;

-- Güvenlik Yetkileri
REVOKE ALL ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) TO service_role;

COMMIT;
