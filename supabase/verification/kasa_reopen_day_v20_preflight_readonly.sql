-- ============================================================================
-- HurCELL Kasa V20 - Preflight Read-Only Doğrulama
-- Amaç:
-- 1. Canlı veritabanında birden fazla açık gün (status = 'open') olup olmadığını kontrol et.
-- 2. Partial unique index (uq_kasa_days_single_open) durumunu kontrol et.
-- 3. Mevcut fn_kasa_reopen_day fonksiyonunu ve izinlerini kontrol et.
-- 4. Aktif yönetici varlığını kontrol et.
-- ============================================================================

WITH open_days_check AS (
    SELECT
        count(*) AS open_day_count,
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'date_val', date_val,
            'status', status
        )), '[]'::jsonb) AS open_days
    FROM public.kasa_days
    WHERE status = 'open'
),
index_check AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'kasa_days'
              AND indexname = 'uq_kasa_days_single_open'
        ) AS index_exists
),
active_admin_check AS (
    SELECT
        count(*) AS active_admin_count,
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'username', username,
            'role', role,
            'is_active', is_active
        )), '[]'::jsonb) AS active_admins
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
),
function_check AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_reopen_day'
        ) AS rpc_exists
),
latest_day_check AS (
    SELECT
        id,
        date_val,
        status,
        expected_cash_kurus,
        counted_cash_kurus,
        closed_at
    FROM public.kasa_days
    ORDER BY date_val DESC
    LIMIT 1
)
SELECT jsonb_pretty(jsonb_build_object(
    'timestamp', now(),
    'open_day_count', (SELECT open_day_count FROM open_days_check),
    'open_days', (SELECT open_days FROM open_days_check),
    'safe_for_unique_index', ((SELECT open_day_count FROM open_days_check) <= 1),
    'partial_unique_index_already_exists', (SELECT index_exists FROM index_check),
    'active_admin_count', (SELECT active_admin_count FROM active_admin_check),
    'rpc_exists', (SELECT rpc_exists FROM function_check),
    'latest_day', (SELECT to_jsonb(l) FROM latest_day_check l)
));
