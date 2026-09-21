-- ============================================================================
-- Migration: 20260921170000_kasa_reopen_closed_day_v19.sql
-- Description: HurCELL Kasa V19 - Kapalı Günü Manuel Yeniden Açma RPC (fn_kasa_reopen_day)
-- Güvenlik: Fail-closed transaction, SECURITY DEFINER, search_path = public, pg_temp,
--           Yalnızca aktif 'yonetici' rolüne izin verir,
--           En az 10 karakter zorunlu gerekçe doğrular,
--           Eşzamanlı açık gün ve kronolojik devir koruması (fail-closed),
--           Kanonik audit log kaydı,
--           REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- 1. Kasa günleri tablosuna yeniden açma denetim alanlarını ekle (idempotent)
ALTER TABLE public.kasa_days
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reopened_by_user_id UUID REFERENCES public.kasa_users(id) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reopen_justification TEXT DEFAULT NULL;

-- 2. Kapalı Günü Yeniden Açma RPC Fonksiyonu
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
    -- Concurrent reopen protection / Row lock
    IF p_kasa_day_id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Geçerli bir kasa günü belirtilmelidir.';
    END IF;

    -- 1. Aktör kullanıcı doğrulama ve Yönetici Rol Kontrolü (NULL-safe)
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktör kullanıcı kimliği zorunludur.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF v_actor.role IS DISTINCT FROM 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Kapalı günü yeniden açma yetkisi yalnızca yöneticilere aittir.';
    END IF;

    -- 2. Zorunlu Gerekçe Kontrolü (En az 10 anlamlı karakter)
    v_clean_justification := trim(COALESCE(p_justification, ''));
    IF length(v_clean_justification) < 10 THEN
        RAISE EXCEPTION 'GEÇERSİZ_GEREKÇE: Yeniden açma gerekçesi zorunludur ve en az 10 anlamlı karakter içermelidir.';
    END IF;

    -- 3. Hedef Kasa Günü Kilidi ve Varlık Kontrolü
    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Belirtilen kasa günü bulunamadı.';
    END IF;

    -- Idempotency Kontrolü: Gün zaten açıksa hiçbir yan etki üretmeden mevcut günü dön
    IF v_day.status = 'open' THEN
        RETURN to_jsonb(v_day);
    END IF;

    -- 4. Tek Açık Gün Kuralı: Sistemde başka herhangi bir açık gün varsa yeniden açma engellenir
    SELECT * INTO v_open_day
    FROM public.kasa_days
    WHERE status = 'open' AND id <> p_kasa_day_id
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_open_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'BAŞKA_GÜN_AÇIK: % tarihli kasa günü açık durumdayken kapalı bir gün yeniden açılamaz. Lütfen önce açık olan günü kapatın.', to_char(v_open_day.date_val, 'YYYY-MM-DD');
    END IF;

    -- 5. Kronoloji ve Devir Koruma Kuralı:
    -- Hedef tarihten sonraki günlere ait kasa kaydı varsa açılış devir bakiyesi zinciri bozulmaması için geçmiş gün açılamaz
    SELECT * INTO v_newer_day
    FROM public.kasa_days
    WHERE date_val > v_day.date_val
    ORDER BY date_val ASC
    LIMIT 1;

    IF v_newer_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'GEÇMİŞ_GÜN_AÇILAMAZ: Bu tarihten sonraki günlere ait kasa kayıtları (% tarihli) bulunduğu için geçmiş gün yeniden açılamaz. Yalnızca en son kapatılmış gün yeniden açılabilir.', to_char(v_newer_day.date_val, 'YYYY-MM-DD');
    END IF;

    -- 6. Günü Yeniden Aç (Durumu 'open' yap ve denetim alanlarını güncelle)
    UPDATE public.kasa_days SET
        status = 'open',
        reopened_at = now(),
        reopened_by_user_id = p_actor_user_id,
        reopen_justification = v_clean_justification
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    -- 7. Kanonik Audit Log Kaydı
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
