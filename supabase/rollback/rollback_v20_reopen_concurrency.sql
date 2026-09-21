-- ============================================================================
-- HurCELL Kasa V20 Rollback - Eşzamanlılık ve Partial Index İyileştirmesini Geri Alma
-- Description: uq_kasa_days_single_open index'ini kaldırır ve fn_kasa_reopen_day fonksiyonunu V19 durumuna getirir.
-- KORUMA: Hiçbir finansal kaydı, satış/gideri veya audit geçmişini silmez.
--         Sahte/doğrulanmamış UUID kullanmaz; aktif yönetici üzerinden audit kaydı düşer.
-- ============================================================================

BEGIN;

-- 1. Partial Unique Index'i kaldır
DROP INDEX IF EXISTS public.uq_kasa_days_single_open;

-- 2. fn_kasa_reopen_day fonksiyonunu V19 durumuna geri yükle
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
    IF p_kasa_day_id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Geçerli bir kasa günü belirtilmelidir.';
    END IF;

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

    v_clean_justification := trim(COALESCE(p_justification, ''));
    IF length(v_clean_justification) < 10 THEN
        RAISE EXCEPTION 'GEÇERSİZ_GEREKÇE: Yeniden açma gerekçesi zorunludur ve en az 10 anlamlı karakter içermelidir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Belirtilen kasa günü bulunamadı.';
    END IF;

    IF v_day.status = 'open' THEN
        RETURN to_jsonb(v_day);
    END IF;

    SELECT * INTO v_open_day
    FROM public.kasa_days
    WHERE status = 'open' AND id <> p_kasa_day_id
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_open_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'BAŞKA_GÜN_AÇIK: % tarihli kasa günü açık durumdayken kapalı bir gün yeniden açılamaz. Lütfen önce açık olan günü kapatın.', to_char(v_open_day.date_val, 'YYYY-MM-DD');
    END IF;

    SELECT * INTO v_newer_day
    FROM public.kasa_days
    WHERE date_val > v_day.date_val
    ORDER BY date_val ASC
    LIMIT 1;

    IF v_newer_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'GEÇMİŞ_GÜN_AÇILAMAZ: Bu tarihten sonraki günlere ait kasa kayıtları (% tarihli) bulunduğu için geçmiş gün yeniden açılamaz. Yalnızca en son kapatılmış gün yeniden açılabilir.', to_char(v_newer_day.date_val, 'YYYY-MM-DD');
    END IF;

    UPDATE public.kasa_days SET
        status = 'open',
        reopened_at = now(),
        reopened_by_user_id = p_actor_user_id,
        reopen_justification = v_clean_justification
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

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

REVOKE ALL ON FUNCTION public.fn_kasa_reopen_day(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_reopen_day(UUID, UUID, TEXT) TO service_role;

-- 3. Güvenli Rollback Audit Log Kaydı (Yalnızca doğrulanmış aktif yönetici varsa)
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
            user_id,
            action,
            entity_type,
            entity_id,
            details,
            justification
        ) VALUES (
            v_admin_id,
            'rollback_applied',
            'kasa_functions',
            v_admin_id,
            jsonb_build_object(
                'version', 'V20',
                'dropped_index', 'uq_kasa_days_single_open',
                'restored_function', 'fn_kasa_reopen_day(UUID, UUID, TEXT) -> V19',
                'rollback_timestamp', now()
            ),
            'HurCELL Kasa V20 Rollback: V20 index kaldırıldı ve fonksiyon V19 durumuna geri döndürüldü.'
        );
    END IF;
END;
$$;

COMMIT;
