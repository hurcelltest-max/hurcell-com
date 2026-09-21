-- ============================================================================
-- HurCELL Kasa V19 Rollback - Kapalı Günü Yeniden Açma Özelliğini Geri Alma
-- Description: fn_kasa_reopen_day fonksiyonunu güvenli biçimde kaldırır.
-- KORUMA: Hiçbir finansal kaydı, satış/gideri veya audit geçmişini silmez.
--         Sahte/doğrulanmamış UUID kullanmaz; aktif yönetici üzerinden audit kaydı düşer.
-- ============================================================================

BEGIN;

-- 1. Yeniden açma RPC fonksiyonunu güvenli biçimde kaldır
DROP FUNCTION IF EXISTS public.fn_kasa_reopen_day(UUID, UUID, TEXT);

-- 2. Güvenli Rollback Audit Log Kaydı (Yalnızca doğrulanmış aktif yönetici varsa)
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
                'version', 'V19',
                'dropped_function', 'fn_kasa_reopen_day(UUID, UUID, TEXT)',
                'rollback_timestamp', now()
            ),
            'HurCELL Kasa V19 Rollback: fn_kasa_reopen_day fonksiyonu geri alındı.'
        );
    END IF;
END;
$$;

COMMIT;
