-- ============================================================================
-- Migration: 20260922150000_kasa_midnight_rollover_v21.sql
-- Description: HurCELL Kasa V21 - Gece Yarısı Tarih Değişimi & Kesintisiz Açık Gün Desteği
-- Güvenlik ve Kurallar:
-- 1. fn_kasa_assert_active_day_for_mutation:
--    - Takvim günü (00.00) geçişinde yapay KASA_GUNU_TARIH_UYUSMAZLIGI hatası vermez.
--    - Kasa günü açık kaldığı sürece satış, gider ve finansal mutasyonları kabul eder.
--    - Yalnızca tek açık gün ve en son kasa günü olma (kronolojik koruma) kuralını doğrular.
-- 2. fn_kasa_get_or_create_open_day:
--    - Sistemde açık bırakılmış geçerli tek bir gün varsa (örn. 21 Eylül) takvim günü 22 Eylül olsa dahi
--      bu açık günü döner ve işlem yapılmasına olanak tanır (PREVIOUS_DAY_UNCLOSED fırlatarak akışı tıkamaz).
--    - Açık gün kapatıldığında ise takvimin güncel İstanbul tarihine göre yeni gün oluşturur/açar.
-- 3. Bütünlük & İzinler:
--    - V20 transaction lock ve partial unique index garantileri korunur.
--    - REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. GÜN MUTASYONU DOĞRULAMA FONKSİYONU (fn_kasa_assert_active_day_for_mutation)
-- ============================================================================
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
    v_open_count INT;
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

    -- 1. Tek Açık Gün Kuralı: Sistemde birden fazla açık gün varsa işlem engellenir (fail-closed)
    SELECT count(*) INTO v_open_count FROM public.kasa_days WHERE status = 'open';
    IF v_open_count > 1 THEN
        RAISE EXCEPTION 'VERİ_BÜTÜNLÜĞÜ_HATASI: Birden fazla açık gün tespit edildi (% açık gün). Lütfen sistem yöneticisine başvurun.', v_open_count;
    END IF;

    -- 2. Kronoloji Kuralı: Hedef günden daha yeni tarihli bir kasa günü varsa geçmiş güne işlem yapılamaz
    IF EXISTS (
        SELECT 1 FROM public.kasa_days
        WHERE date_val > v_day.date_val
    ) THEN
        RAISE EXCEPTION 'GEÇMİŞ_GÜN_İŞLEM_YAPILAMAZ: Bu tarihten sonraki günlere ait kasa kayıtları bulunduğu için geçmiş güne işlem yapılamaz.';
    END IF;

    RETURN v_day;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) TO service_role;


-- ============================================================================
-- 2. AÇIK GÜNÜ GETİRME VEYA YENİ GÜN OLUŞTURMA RPC'Sİ (fn_kasa_get_or_create_open_day)
-- ============================================================================
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
    v_open_day public.kasa_days%ROWTYPE;
    v_prev_closed_day public.kasa_days%ROWTYPE;
    v_actor public.kasa_users%ROWTYPE;
    v_opening_balance BIGINT := 0;
    v_usd_balance BIGINT := 0;
    v_usd_cost_pool BIGINT := 0;
    v_eur_balance BIGINT := 0;
    v_eur_cost_pool BIGINT := 0;
    v_open_count INT;
BEGIN
    -- Aktör kullanıcı doğrulama
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktör kullanıcı kimliği zorunludur.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    v_today := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;

    -- 1. Sistemde halihazırda açık bir gün var mı kontrol et
    SELECT * INTO v_open_day
    FROM public.kasa_days
    WHERE status = 'open'
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_open_day.id IS NOT NULL THEN
        -- Birden fazla açık gün kontrolü (fail-closed)
        SELECT count(*) INTO v_open_count FROM public.kasa_days WHERE status = 'open';
        IF v_open_count > 1 THEN
            RAISE EXCEPTION 'VERİ_BÜTÜNLÜĞÜ_HATASI: Birden fazla açık gün tespit edildi (% açık gün).', v_open_count;
        END IF;

        -- Açık gün sistemdeki en son gün mü kontrolü
        IF EXISTS (SELECT 1 FROM public.kasa_days WHERE date_val > v_open_day.date_val) THEN
            RAISE EXCEPTION 'KRONOLOJİ_BOZUK: Daha yeni tarihli kasa günü varken eski gün açık kalamaz.';
        END IF;

        -- Mevcut geçerli tek açık günü döndür (Tarihi önceki takvim gününe ait olsa dahi kapatılana kadar aktif kalır)
        RETURN to_jsonb(v_open_day);
    END IF;

    -- 2. Sistemde açık gün yoksa: Bugünün gününü oluşturmak için advisory lock al
    PERFORM pg_advisory_xact_lock(hashtext('kasa_day_open_' || v_today::text));

    -- Kilitten sonra bugünün kaydı açılmış mı tekrar kontrol et
    SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
    IF v_day.id IS NOT NULL THEN
        RETURN to_jsonb(v_day);
    END IF;

    -- 3. En yakın önceki kapalı gün ve sayılan nakit bakiye belirlenir
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

    -- 4. Bugünün yeni kasa günü oluşturulur
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

    -- 5. Açılış bakiyesi hareketi yazılır (append-only)
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

    -- 6. Denetim log kaydı
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_acildi', 'kasa_days', v_day.id,
        jsonb_build_object(
            'opening_balance_kurus', v_opening_balance,
            'source_day_id', v_prev_closed_day.id,
            'source_date', v_prev_closed_day.date_val,
            'created_date_val', v_today
        )
    );

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) TO service_role;

COMMIT;
