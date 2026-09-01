-- ============================================================================
-- Verification: kasa_sale_product_name_v10_postflight_readonly.sql
-- Description: Salt okunur V10 postflight doğrulama sorgusu.
-- Production Güvenliği: Kesinlikle salt okunurdur, hiçbir veri/şema değiştirmez.
-- ============================================================================

WITH fn_cat AS (
    SELECT
        p.proname,
        p.pronargs,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
),
fn_audit AS (
    SELECT
        -- İki overload mevcut olmalı: 32 parametreli canonical ve 31 parametreli wrapper
        COUNT(*) = 2 AS overloads_count_is_two,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%p_product_name%') AS canonical_32_exists,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 31 AND funcdef LIKE '%v_fallback_product_name%') AS wrapper_31_exists,
        -- Tüm overloadlar SECURITY DEFINER ve search_path güvenli olmalı
        COUNT(*) FILTER (WHERE prosecdef = true) = 2 AS all_are_security_definer,
        COUNT(*) FILTER (WHERE funcdef LIKE '%search_path%public%pg_temp%') = 2 AS all_have_safe_search_path,
        -- Canonical fonksiyon kontrolleri
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef ~* 'INSERT\s+INTO\s+public\.kasa_sales\s*\([^)]*product_name') AS product_name_in_insert_columns,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%TRIM(p_product_name)%') AS product_name_trimmed_in_values,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%GEÇERSİZ_ÜRÜN_ADI%') AS product_name_validation_present,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef ~* 'INSERT\s+INTO\s+public\.kasa_sales\s*\([^)]*receipt_no') AS receipt_no_in_insert_columns,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%kasa_receipt_seq%') AS sequence_referenced,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%p_service_cost_bank_account_id%') AS ts_bank_flow_present,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%fn_kasa_check_idempotency%') AS idempotency_present
    FROM fn_cat
),
acl_audit AS (
    SELECT
        -- Her iki overload için de PUBLIC ve anon/auth yetkileri iptal edilmiş olmalı
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
        -- Her iki overload için service_role EXECUTE açık olmalı
        (
            SELECT COUNT(DISTINCT p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_create_sale'
              AND r.rolname = 'service_role'
              AND acl.privilege_type = 'EXECUTE'
        ) = 2 AS service_role_execute_allowed_for_both
)
SELECT
    jsonb_build_object(
        'overall_ok', (
            fa.overloads_count_is_two
            AND fa.canonical_32_exists
            AND fa.wrapper_31_exists
            AND fa.all_are_security_definer
            AND fa.all_have_safe_search_path
            AND fa.product_name_in_insert_columns
            AND fa.product_name_trimmed_in_values
            AND fa.product_name_validation_present
            AND fa.receipt_no_in_insert_columns
            AND fa.sequence_referenced
            AND fa.ts_bank_flow_present
            AND fa.idempotency_present
            AND aa.public_and_auth_execute_revoked
            AND aa.service_role_execute_allowed_for_both
        ),
        'overloads_count_is_two', fa.overloads_count_is_two,
        'canonical_32_exists', fa.canonical_32_exists,
        'wrapper_31_exists', fa.wrapper_31_exists,
        'all_are_security_definer', fa.all_are_security_definer,
        'all_have_safe_search_path', fa.all_have_safe_search_path,
        'product_name_in_insert_columns', fa.product_name_in_insert_columns,
        'product_name_trimmed_in_values', fa.product_name_trimmed_in_values,
        'product_name_validation_present', fa.product_name_validation_present,
        'receipt_no_in_insert_columns', fa.receipt_no_in_insert_columns,
        'sequence_referenced', fa.sequence_referenced,
        'ts_bank_flow_present', fa.ts_bank_flow_present,
        'idempotency_present', fa.idempotency_present,
        'public_and_auth_execute_revoked', aa.public_and_auth_execute_revoked,
        'service_role_execute_allowed_for_both', aa.service_role_execute_allowed_for_both
    ) AS postflight_verification_report
FROM fn_audit fa
CROSS JOIN acl_audit aa;
