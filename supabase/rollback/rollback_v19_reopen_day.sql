-- ============================================================================
-- HurCELL Kasa V19 Rollback - Kapalı Günü Yeniden Açma Özelliğini Geri Alma
-- Description: fn_kasa_reopen_day fonksiyonunu kaldırır ve audit kaydı düşer.
-- KORUMA: Hiçbir finansal kaydı, satış/gideri veya audit geçmişini silmez.
-- ============================================================================

BEGIN;

-- 1. Yeniden açma RPC fonksiyonunu kaldır
DROP FUNCTION IF EXISTS public.fn_kasa_reopen_day(UUID, UUID, TEXT);

-- 2. Rollback Audit Log Kaydı
INSERT INTO public.kasa_audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    justification
) VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'rollback_applied',
    'kasa_functions',
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object(
        'version', 'V19',
        'dropped_function', 'fn_kasa_reopen_day(UUID, UUID, TEXT)'
    ),
    'HurCELL Kasa V19 Rollback: fn_kasa_reopen_day fonksiyonu geri alındı.'
);

COMMIT;
