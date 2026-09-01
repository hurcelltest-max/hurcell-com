-- ============================================================================
-- Verification: kasa_sale_receipt_no_v9_postflight_readonly.sql
-- Description: Salt okunur postflight doğrulama sorgusu (V9 sonrası tam güvenlik ve işlev kontrolü).
-- Production güvenliği: Salt okunurdur, hiçbir veri veya şema değiştirmez.
-- ============================================================================

WITH seq_audit AS (
    SELECT 
        EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq') AS sequence_exists,
        (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq') AS seq_last_value
),
sales_audit AS (
    SELECT 
        COUNT(*) AS total_sales_count,
        COUNT(*) FILTER (WHERE receipt_no IS NULL OR TRIM(receipt_no) = '') AS null_or_empty_receipt_count,
        (COUNT(*) - COUNT(DISTINCT receipt_no)) AS duplicate_receipt_count,
        COALESCE(MAX(
            CASE 
                WHEN receipt_no ~ '^FS-[0-9]{8}-([0-9]+)$' THEN 
                    CAST(SUBSTRING(receipt_no FROM '^FS-[0-9]{8}-([0-9]+)$') AS BIGINT)
                ELSE 0
            END
        ), 0) AS max_receipt_suffix
    FROM public.kasa_sales
),
fn_cat AS (
    SELECT 
        p.proname,
        p.prosecdef,
        p.prosrc,
        p.proconfig,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
),
fn_audit AS (
    SELECT 
        (SELECT COUNT(*) FROM fn_cat) = 1 AS single_create_sale_overload,
        EXISTS (SELECT 1 FROM fn_cat WHERE prosecdef = true) AS is_security_definer,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%search_path%public%pg_temp%') AS safe_search_path_present,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%kasa_receipt_seq%') AS sequence_referenced_in_fn,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%FS-%' AND funcdef LIKE '%date_val%') AS receipt_uses_day_date_val,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef ~* 'INSERT\s+INTO\s+public\.kasa_sales\s*\([^)]*receipt_no') AS receipt_no_in_insert_columns,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%VALUES (%' AND funcdef LIKE '%v_receipt_no%') AS receipt_no_in_values_list,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%p_service_cost_bank_account_id%' AND funcdef LIKE '%kasa_bank_transactions%') AS ts_bank_flow_present,
        EXISTS (SELECT 1 FROM fn_cat WHERE funcdef LIKE '%fn_kasa_check_idempotency%' AND funcdef LIKE '%fn_kasa_save_idempotency%') AS idempotency_flow_present
),
acl_audit AS (
    SELECT
        NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            LEFT JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_create_sale'
              AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
              AND acl.privilege_type = 'EXECUTE'
        ) AS public_and_auth_execute_revoked,
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_create_sale'
              AND r.rolname = 'service_role'
              AND acl.privilege_type = 'EXECUTE'
        ) AS service_role_execute_allowed
)
SELECT 
    jsonb_build_object(
        'overall_ok', (
            sq.sequence_exists 
            AND sa.null_or_empty_receipt_count = 0
            AND sa.duplicate_receipt_count = 0
            AND fa.single_create_sale_overload
            AND fa.is_security_definer
            AND fa.safe_search_path_present
            AND fa.sequence_referenced_in_fn
            AND fa.receipt_uses_day_date_val
            AND fa.receipt_no_in_insert_columns
            AND fa.receipt_no_in_values_list
            AND fa.ts_bank_flow_present
            AND fa.idempotency_flow_present
            AND aa.public_and_auth_execute_revoked
            AND aa.service_role_execute_allowed
        ),
        'sequence_exists', sq.sequence_exists,
        'seq_last_value', sq.seq_last_value,
        'total_sales_count', sa.total_sales_count,
        'null_or_empty_receipt_count', sa.null_or_empty_receipt_count,
        'duplicate_receipt_count', sa.duplicate_receipt_count,
        'max_receipt_suffix', sa.max_receipt_suffix,
        'single_create_sale_overload', fa.single_create_sale_overload,
        'is_security_definer', fa.is_security_definer,
        'safe_search_path_present', fa.safe_search_path_present,
        'sequence_referenced_in_fn', fa.sequence_referenced_in_fn,
        'receipt_uses_day_date_val', fa.receipt_uses_day_date_val,
        'receipt_no_in_insert_columns', fa.receipt_no_in_insert_columns,
        'receipt_no_in_values_list', fa.receipt_no_in_values_list,
        'ts_bank_flow_present', fa.ts_bank_flow_present,
        'idempotency_flow_present', fa.idempotency_flow_present,
        'public_and_auth_execute_revoked', aa.public_and_auth_execute_revoked,
        'service_role_execute_allowed', aa.service_role_execute_allowed
    ) AS postflight_verification_report
FROM seq_audit sq
CROSS JOIN sales_audit sa
CROSS JOIN fn_audit fa
CROSS JOIN acl_audit aa;
