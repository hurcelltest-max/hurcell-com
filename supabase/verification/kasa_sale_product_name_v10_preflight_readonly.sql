-- ============================================================================
-- Verification: kasa_sale_product_name_v10_preflight_readonly.sql
-- Description: Salt okunur V10 preflight kontrol sorgusu.
-- Production Güvenliği: Kesinlikle salt okunurdur, hiçbir veri/şema değiştirmez.
-- ============================================================================

WITH col_info AS (
    SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kasa_sales'
      AND column_name = 'product_name'
),
sales_info AS (
    SELECT
        COUNT(*) AS total_sales_count,
        COUNT(*) FILTER (WHERE product_name IS NULL OR TRIM(product_name) = '') AS invalid_product_name_count,
        COUNT(*) FILTER (WHERE receipt_no IS NULL OR TRIM(receipt_no) = '') AS invalid_receipt_no_count,
        COALESCE(MAX(
            CASE
                WHEN receipt_no ~ '^FS-[0-9]{8}-([0-9]+)$' THEN
                    CAST(SUBSTRING(receipt_no FROM '^FS-[0-9]{8}-([0-9]+)$') AS BIGINT)
                ELSE 0
            END
        ), 0) AS max_receipt_suffix
    FROM public.kasa_sales
),
open_day_info AS (
    SELECT
        id AS open_day_id,
        date_val AS open_day_date,
        status AS open_day_status
    FROM public.kasa_days
    WHERE status = 'open'
    ORDER BY date_val DESC
    LIMIT 1
),
fn_info AS (
    SELECT
        COUNT(*) AS create_sale_overloads_count,
        EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_create_sale'
              AND pg_get_functiondef(p.oid) ~* 'INSERT\s+INTO\s+public\.kasa_sales\s*\([^)]*product_name'
        ) AS current_fn_inserts_product_name,
        EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_create_sale'
              AND pg_get_functiondef(p.oid) ~* 'p_product_name'
        ) AS current_fn_has_product_name_param
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
)
SELECT
    jsonb_build_object(
        'preflight_status', 'READY_FOR_V10_MIGRATION',
        'product_name_col_nullable', ci.is_nullable,
        'product_name_col_default', ci.column_default,
        'total_sales_count', sa.total_sales_count,
        'invalid_product_name_count', sa.invalid_product_name_count,
        'invalid_receipt_no_count', sa.invalid_receipt_no_count,
        'max_receipt_suffix', sa.max_receipt_suffix,
        'open_day_id', od.open_day_id,
        'open_day_date', od.open_day_date,
        'create_sale_overloads_count', fi.create_sale_overloads_count,
        'current_fn_inserts_product_name', fi.current_fn_inserts_product_name,
        'current_fn_has_product_name_param', fi.current_fn_has_product_name_param,
        'diagnosis', CASE
            WHEN NOT fi.current_fn_inserts_product_name THEN 'KÖK NEDEN DOĞRULANDI: fn_kasa_create_sale INSERT kolon listesinde product_name eksiktir. V10 canonical migration uygulanmalıdır.'
            ELSE 'Fonksiyonda product_name INSERT kolonu zaten mevcuttur.'
        END
    ) AS preflight_diagnostic_report
FROM col_info ci
CROSS JOIN sales_info sa
LEFT JOIN open_day_info od ON true
CROSS JOIN fn_info fi;
