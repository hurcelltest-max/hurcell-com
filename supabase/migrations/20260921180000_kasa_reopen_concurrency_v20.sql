-- ============================================================================
-- Migration: 20260921180000_kasa_reopen_concurrency_v20.sql
-- Description: HurCELL Kasa V20 - Eşzamanlılık Korumalı ve Partial Unique Index Garantili Gün Yeniden Açma
-- Güvenlik:
-- 1. PostgreSQL Transaction Advisory Lock ile eşzamanlı yeniden açma işlemlerini serialize eder.
-- 2. Partial Unique Index (uq_kasa_days_single_open) ile veritabanı seviyesinde tek açık gün garantisi sağlar.
-- 3. Idempotency kontrolünde hedef gün açıkken başka açık gün bulunması durumunda fail-closed hata üretir.
-- 4. NULL-safe kontroller, en az 10 karakter gerekçe, kronolojik devir koruması ve kanonik audit log içerir.
-- 5. REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- 1. Veritabanı Seviyesinde Tek Açık Gün Kısıtı (Partial Unique Index)
-- Sadece 'open' durumundaki kayıtlar için tekillik zorunlu tutulur.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kasa_days_single_open
    ON public.kasa_days (status)
    WHERE (status = 'open');

-- 2. Güncellenmiş ve Eşzamanlılık Korumalı RPC Fonksiyonu
CREATE OR REPLACE FUNCTION public.fn_kasa_reopen_day(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
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
    v_open_day public.kasa_days%ROWTYPE;
    v_newer_day public.kasa_days%ROWTYPE;
    v_clean_justification TEXT;
BEGIN
    -- 1. Parametre Varlık Kontrolleri
    IF p_kasa_day_id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Geçerli bir kasa günü belirtilmelidir.';
    END IF;

    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktör kullanıcı kimliği zorunludur.';
    END IF;

    -- 2. Aktör kullanıcı doğrulama ve Yönetici Rol Kontrolü (NULL-safe)
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF v_actor.role IS DISTINCT FROM 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Kapalı günü yeniden açma yetkisi yalnızca yöneticilere aittir.';
    END IF;

    -- 3. Zorunlu Gerekçe Kontrolü (En az 10 anlamlı karakter)
    v_clean_justification := trim(COALESCE(p_justification, ''));
    IF length(v_clean_justification) < 10 THEN
        RAISE EXCEPTION 'GEÇERSİZ_GEREKÇE: Yeniden açma gerekçesi zorunludur ve en az 10 anlamlı karakter içermelidir.';
    END IF;

    -- 4. Transaction Kapsamında Kasa Günü Yeniden Açma İşlemlerini Serialize Eden Advisory Lock
    -- hashtext('hurcell_kasa_reopen_day_lock') deterministik bir kilit kimliği üretir
    PERFORM pg_advisory_xact_lock(hashtext('hurcell_kasa_reopen_day_lock'));

    -- 5. Hedef Kasa Günü Kilidi ve Varlık Kontrolü (Satır Kilidi)
    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Belirtilen kasa günü bulunamadı.';
    END IF;

    -- 6. Sistemdeki Diğer Açık Gün Kontrolü
    SELECT * INTO v_open_day
    FROM public.kasa_days
    WHERE status = 'open' AND id <> p_kasa_day_id
    ORDER BY date_val DESC
    LIMIT 1;

    -- 7. Idempotency ve Veri Bütünlüğü Kontrolü
    IF v_day.status = 'open' THEN
        IF v_open_day.id IS NOT NULL THEN
            RAISE EXCEPTION 'VERİ_BÜTÜNLÜĞÜ_HATASI: Birden fazla açık gün tespit edildi (% ve %). Lütfen sistem yöneticisine başvurun.', to_char(v_day.date_val, 'YYYY-MM-DD'), to_char(v_open_day.date_val, 'YYYY-MM-DD');
        END IF;
        -- Hedef gün zaten açık ve tek açık gün ise yan etki üretmeden mevcut kaydı dön
        RETURN to_jsonb(v_day);
    END IF;

    -- Hedef gün kapalıyken sistemde başka açık gün varsa engelle
    IF v_open_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'BAŞKA_GÜN_AÇIK: % tarihli kasa günü açık durumdayken kapalı bir gün yeniden açılamaz. Lütfen önce açık olan günü kapatın.', to_char(v_open_day.date_val, 'YYYY-MM-DD');
    END IF;

    -- 8. Hedef Günün Durum Kontrolü
    IF v_day.status <> 'closed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_DURUM: Yalnızca kapalı durumdaki kasa günleri yeniden açılabilir. Mevcut durum: %', v_day.status;
    END IF;

    -- 9. Kronoloji ve Devir Koruma Kuralı (Sistemdeki En Son Gün Kontrolü)
    -- Hedef tarihten sonraki günlere ait kasa kaydı varsa açılış devir bakiyesi zinciri bozulmaması için geçmiş gün açılamaz
    SELECT * INTO v_newer_day
    FROM public.kasa_days
    WHERE date_val > v_day.date_val
    ORDER BY date_val ASC
    LIMIT 1;

    IF v_newer_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'GEÇMİŞ_GÜN_AÇILAMAZ: Bu tarihten sonraki günlere ait kasa kayıtları (% tarihli) bulunduğu için geçmiş gün yeniden açılamaz. Yalnızca en son kapatılmış gün yeniden açılabilir.', to_char(v_newer_day.date_val, 'YYYY-MM-DD');
    END IF;

    -- 10. Günü Yeniden Aç (Durumu 'open' yap ve denetim alanlarını güncelle)
    UPDATE public.kasa_days SET
        status = 'open',
        reopened_at = now(),
        reopened_by_user_id = p_actor_user_id,
        reopen_justification = v_clean_justification
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    -- 11. Kanonik Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        justification
    ) VALUES (
        p_actor_user_id,
        'gun_yeniden_acildi',
        'kasa_days',
        p_kasa_day_id,
        jsonb_build_object(
            'kasa_day_id', p_kasa_day_id,
            'date_val', v_day.date_val,
            'previous_status', 'closed',
            'new_status', 'open',
            'actor_user_id', p_actor_user_id,
            'actor_role', v_actor.role,
            'reopened_at', now(),
            'previous_closing_expected_cash_kurus', v_day.expected_cash_kurus,
            'previous_closing_counted_cash_kurus', v_day.counted_cash_kurus,
            'previous_closed_at', v_day.closed_at,
            'previous_closed_by_user_id', v_day.closed_by_user_id
        ),
        v_clean_justification
    );

    RETURN to_jsonb(v_day);
END;
$$;

-- 3. Güvenlik İzinleri (Service role only)
REVOKE ALL ON FUNCTION public.fn_kasa_reopen_day(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_reopen_day(UUID, UUID, TEXT) TO service_role;

COMMIT;
