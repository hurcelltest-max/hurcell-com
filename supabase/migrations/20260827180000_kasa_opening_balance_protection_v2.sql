-- Migration: Enhanced Day Opening & Carryover Protection RPC
-- File: supabase/migrations/20260827180000_kasa_opening_balance_protection_v2.sql

BEGIN;

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
    v_mov_count INT := 0;
    v_diff BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    v_today := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;

    PERFORM pg_advisory_xact_lock(hashtext('kasa_day_open_' || v_today::text));

    -- Kural 1: Kendisinden daha eski açık kasa günü varsa yeni gün açılması engellenir
    SELECT * INTO v_unclosed_day
    FROM public.kasa_days
    WHERE status = 'open' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_unclosed_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'PREVIOUS_DAY_UNCLOSED: % tarihli kasa günü henüz kapatılmamış. Lütfen öncelikle gün sonu sayımını yaparak önceki günü kapatın.', to_char(v_unclosed_day.date_val, 'YYYY-MM-DD');
    END IF;

    -- Kural 2: En yakın önceki kapalı gün ve sayılan nakit bakiye belirlenir
    SELECT * INTO v_prev_closed_day
    FROM public.kasa_days
    WHERE status = 'closed' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_prev_closed_day.id IS NOT NULL THEN
        IF v_prev_closed_day.counted_cash_kurus IS NULL THEN
            RAISE EXCEPTION 'KAYNAK_BAKİYE_EKSİK: Önceki kapatılan günün (%) sayılan nakit tutarı bulunamadı.', v_prev_closed_day.date_val;
        END IF;
        v_opening_balance := v_prev_closed_day.counted_cash_kurus;
        v_usd_balance := COALESCE(v_prev_closed_day.counted_usd_cents, v_prev_closed_day.usd_balance_cents, 0);
        v_usd_cost_pool := COALESCE(v_prev_closed_day.usd_cost_pool_kurus, 0);
        v_eur_balance := COALESCE(v_prev_closed_day.counted_eur_cents, v_prev_closed_day.eur_balance_cents, 0);
        v_eur_cost_pool := COALESCE(v_prev_closed_day.eur_cost_pool_kurus, 0);
    END IF;

    -- Kural 3: Bugünün kaydı zaten varsa açılış bakiyesi doğrulanır
    SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
    IF v_day.id IS NOT NULL THEN
        -- Açılış bakiyesi uyuşmuyorsa
        IF v_prev_closed_day.id IS NOT NULL AND v_day.opening_balance_kurus <> v_opening_balance THEN
            -- Günlük finansal hareket kontrolü (acilis_bakiyesi hariç)
            SELECT COUNT(*) INTO v_mov_count
            FROM public.kasa_movements
            WHERE kasa_day_id = v_day.id AND movement_type <> 'acilis_bakiyesi';

            IF v_mov_count = 0 THEN
                -- Hiç finansal hareket yoksa atomik açılış güncellenir ve append-only carryover_repair hareketi yazılır
                v_diff := v_opening_balance - v_day.opening_balance_kurus;

                UPDATE public.kasa_days SET
                    opening_balance_kurus = v_opening_balance,
                    usd_balance_cents = v_usd_balance,
                    eur_balance_cents = v_eur_balance
                WHERE id = v_day.id
                RETURNING * INTO v_day;

                INSERT INTO public.kasa_movements (
                    kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
                ) VALUES (
                    v_day.id, 'carryover_repair', abs(v_diff), 0, 0,
                    'Açılış Devir Bakiyesi Otomatik Doğrulaması (Kaynak: ' || v_prev_closed_day.date_val || ' Kapanışı ' || (v_opening_balance / 100.0) || ' TL)',
                    p_actor_user_id
                );

                INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
                VALUES (
                    p_actor_user_id, 'devir_otomatik_dogrulandi', 'kasa_days', v_day.id,
                    jsonb_build_object('old_opening_balance_kurus', v_day.opening_balance_kurus, 'new_opening_balance_kurus', v_opening_balance, 'source_day_id', v_prev_closed_day.id)
                );
            END IF;
            -- Finansal hareket varsa otomatik bakiye değiştirilmez, v_day aynen döndürülür (service.ts repair_required bayrağını üretir)
        END IF;

        RETURN to_jsonb(v_day);
    END IF;

    -- Bugünün yeni kasa günü oluşturulur
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

    -- Açılış bakiyesi hareketi yazılır (append-only)
    BEGIN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_day.id, 'acilis_bakiyesi', v_opening_balance, 0, 0,
            'Kasa Açılışı / Önceki Gün Devri' || CASE WHEN v_prev_closed_day.id IS NOT NULL THEN ' (Kaynak: ' || v_prev_closed_day.date_val || ')' ELSE '' END,
            p_actor_user_id
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_acildi', 'kasa_days', v_day.id,
        jsonb_build_object('opening_balance_kurus', v_opening_balance, 'source_day_id', v_prev_closed_day.id, 'source_date', v_prev_closed_day.date_val)
    );

    RETURN to_jsonb(v_day);
END;
$$;

-- Güvenlik Yetkileri
REVOKE ALL ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) TO service_role;

COMMIT;
