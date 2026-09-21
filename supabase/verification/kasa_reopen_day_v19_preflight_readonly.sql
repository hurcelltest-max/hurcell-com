-- ============================================================================
-- Verification: kasa_reopen_day_v19_preflight_readonly.sql
-- Description: HurCELL Kasa V19 Preflight Salt-Okunur Yedek ve Durum Tespiti
-- KESİN SINIR: Yalnızca SELECT ve CTE çalıştırır. Asla INSERT/UPDATE/DELETE/DDL içermez.
-- ============================================================================

WITH latest_days AS (
    SELECT
        id,
        date_val,
        status,
        opening_balance_kurus,
        expected_cash_kurus,
        counted_cash_kurus,
        cash_difference_kurus,
        closed_at,
        closed_by_user_id
    FROM public.kasa_days
    ORDER BY date_val DESC
    LIMIT 5
),
existing_functions AS (
    SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_kasa_close_day', 'fn_kasa_get_or_create_open_day', 'fn_kasa_reopen_day')
),
open_days_check AS (
    SELECT
        COUNT(*) AS open_days_count,
        COALESCE(jsonb_agg(jsonb_build_object('id', id, 'date_val', date_val)), '[]'::jsonb) AS open_days_list
    FROM public.kasa_days
    WHERE status = 'open'
)
SELECT jsonb_pretty(jsonb_build_object(
    'preflight_timestamp', now(),
    'latest_5_days', (SELECT jsonb_agg(to_jsonb(ld)) FROM latest_days ld),
    'open_days_summary', (SELECT to_jsonb(odc) FROM open_days_check odc),
    'existing_functions', (SELECT jsonb_agg(to_jsonb(ef)) FROM existing_functions ef),
    'v19_already_applied', EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_reopen_day'
    )
)) AS preflight_diagnostic_report;
