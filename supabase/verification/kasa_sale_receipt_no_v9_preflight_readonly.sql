-- ============================================================================
-- Verification: kasa_sale_receipt_no_v9_preflight_readonly.sql
-- Description: Salt okunur preflight kontrol sorgusu (V9 öncesi durum ve eksiklik kontrolü).
-- Production güvenliği: Salt okunurdur, hiçbir veri veya şema değiştirmez.
-- ============================================================================

WITH seq_info AS (
    SELECT 
        EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq') AS sequence_exists,
        (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq') AS current_seq_last_value
),
sales_info AS (
    SELECT 
        COUNT(*) AS total_sales_count,
        COUNT(*) FILTER (WHERE receipt_no IS NULL OR TRIM(receipt_no) = '') AS invalid_receipt_no_count,
        COALESCE(MAX(
            CASE 
                WHEN receipt_no ~ '^FS-[0-9]{8}-([0-9]+)$' THEN 
                    CAST(SUBSTRING(receipt_no FROM '^FS-[0-9]{8}-([0-9]+)$') AS BIGINT)
                ELSE 0
            END
        ), 0) AS max_receipt_suffix,
        COUNT(DISTINCT receipt_no) AS distinct_receipt_count
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
              AND pg_get_functiondef(p.oid) ~* 'INSERT\s+INTO\s+public\.kasa_sales\s*\([^)]*receipt_no'
        ) AS current_fn_inserts_receipt_no
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
)
SELECT 
    jsonb_build_object(
        'preflight_status', 'READY_FOR_V9_MIGRATION',
        'sequence_exists', s.sequence_exists,
        'current_seq_last_value', s.current_seq_last_value,
        'total_sales_count', sa.total_sales_count,
        'invalid_receipt_no_count', sa.invalid_receipt_no_count,
        'max_receipt_suffix', sa.max_receipt_suffix,
        'distinct_receipt_count', sa.distinct_receipt_count,
        'open_day_id', od.open_day_id,
        'open_day_date', od.open_day_date,
        'open_day_status', od.open_day_status,
        'create_sale_overloads_count', fi.create_sale_overloads_count,
        'current_fn_inserts_receipt_no', fi.current_fn_inserts_receipt_no,
        'diagnosis', CASE 
            WHEN NOT fi.current_fn_inserts_receipt_no THEN 'KÖK NEDEN TESPİT EDİLDİ: fn_kasa_create_sale fonksiyonunun INSERT INTO public.kasa_sales kolon listesinde receipt_no eksiktir. V9 migration uygulanmalıdır.'
            ELSE 'Fonksiyon INSERT kolon listesinde receipt_no zaten mevcuttur.'
        END
    ) AS preflight_diagnostic_report
FROM seq_info s
CROSS JOIN sales_info sa
LEFT JOIN open_day_info od ON true
CROSS JOIN fn_info fi;
