-- ============================================================================
-- HurCELL Kasa V13 - Satış İptal Fonksiyonu Şema Düzeltmesi Postflight SQL (Salt-Okunur)
-- Amaç:
--  1. fn_kasa_cancel_sale fonksiyonunun tekil 5-parametreli imzasını doğrulamak.
--  2. İki aşamalı sales_update_start ve sales_update_bounds CTE'si ile (ord > start_ord kısıtıyla)
--     public.kasa_sales UPDATE bloğunu satır bazında izole etmek ve içinde updated_at bulunmadığını doğrulamak.
--  3. public.kasa_sales UPDATE bloğunun status, description, uncollected_credit_kurus ve uncollected_cost_kurus alanlarını içerdiğini teyit etmek.
--  4. Bahar AYDAMGA (38eca216-7235-414b-8cc3-349087a166da) yetkisinin ve personel rolünün korunduğunu teyit etmek.
--  5. Diğer personellerin yetkisiz olduğunu teyit etmek.
--  6. FS-20260902-00060 satışının migration tarafından değiştirilmediğini (completed, satis=1, iptal=0) doğrulamak.
-- KESİN KURAL: Dinamik denetim, sıfır hardcoded true, salt-okunur CTE yapısı.
-- ============================================================================

WITH permissions_table_audit AS (
    SELECT
        to_regclass('public.kasa_user_permissions') IS NOT NULL AS table_exists,
        (
            SELECT relrowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'kasa_user_permissions'
        ) AS rls_enabled
),
bahar_user_audit AS (
    SELECT
        u.id AS user_id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        EXISTS (
            SELECT 1
            FROM public.kasa_user_permissions up
            WHERE up.user_id = u.id
              AND up.permission_key = 'kasa.sale.cancel'
              AND up.is_allowed = true
              AND up.revoked_at IS NULL
        ) AS has_cancel_permission
    FROM public.kasa_users u
    WHERE u.id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
),
other_staff_audit AS (
    SELECT
        COUNT(*) AS other_staff_count,
        COUNT(*) FILTER (
            WHERE EXISTS (
                SELECT 1
                FROM public.kasa_user_permissions up
                WHERE up.user_id = u.id
                  AND up.permission_key = 'kasa.sale.cancel'
                  AND up.is_allowed = true
                  AND up.revoked_at IS NULL
            )
        ) AS unauthorized_staff_with_permission_count
    FROM public.kasa_users u
    WHERE u.role = 'personel'
      AND u.id <> '38eca216-7235-414b-8cc3-349087a166da'::uuid
),
fn_lines AS (
    SELECT
        p.oid,
        line_text,
        ord
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') WITH ORDINALITY AS t(line_text, ord)
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_cancel_sale'
      AND p.pronargs = 5
      AND pg_get_function_identity_arguments(p.oid) = 'p_actor_user_id uuid, p_sale_id uuid, p_justification text, p_cancel_movements boolean, p_idempotency_key text'
),
sales_update_start AS (
    SELECT
        oid,
        MIN(ord) AS start_ord
    FROM fn_lines
    WHERE line_text ~* 'UPDATE[[:space:]]+(public[.])?kasa_sales[[:space:]]+SET'
    GROUP BY oid
),
sales_update_bounds AS (
    SELECT
        s.oid,
        s.start_ord,
        MIN(l.ord) AS end_ord
    FROM sales_update_start s
    JOIN fn_lines l
      ON l.oid = s.oid
     AND l.ord > s.start_ord
     AND l.line_text ~* 'WHERE[[:space:]]+id[[:space:]]*=[[:space:]]*p_sale_id'
    GROUP BY s.oid, s.start_ord
),
sales_update_block AS (
    SELECT
        b.oid,
        b.start_ord,
        b.end_ord,
        string_agg(l.line_text, E'\n' ORDER BY l.ord) AS block_text
    FROM sales_update_bounds b
    JOIN fn_lines l
      ON l.oid = b.oid
     AND l.ord BETWEEN b.start_ord AND b.end_ord
    GROUP BY b.oid, b.start_ord, b.end_ord
),
fn_audit AS (
    SELECT
        COUNT(*) = 1 AS overload_count_is_one,
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_cancel_sale'
              AND p.pronargs = 5
              AND pg_get_function_identity_arguments(p.oid) = 'p_actor_user_id uuid, p_sale_id uuid, p_justification text, p_cancel_movements boolean, p_idempotency_key text'
        ) AS canonical_signature_matches,
        EXISTS (
            SELECT 1
            FROM sales_update_block sub
            WHERE sub.block_text IS NOT NULL
              AND sub.start_ord IS NOT NULL
              AND sub.end_ord IS NOT NULL
              AND sub.end_ord > sub.start_ord
              AND POSITION('updated_at' IN LOWER(sub.block_text)) = 0
              AND POSITION('status' IN LOWER(sub.block_text)) > 0
              AND POSITION('cancelled' IN LOWER(sub.block_text)) > 0
              AND POSITION('description' IN LOWER(sub.block_text)) > 0
              AND POSITION('uncollected_credit_kurus' IN LOWER(sub.block_text)) > 0
              AND POSITION('uncollected_cost_kurus' IN LOWER(sub.block_text)) > 0
        ) AS sales_update_block_valid_and_clean,
        (
            SELECT bool_and(p.prosecdef)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
        ) AS is_security_definer,
        (
            SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%search_path%public%pg_temp%')
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
        ) AS has_safe_search_path,
        (
            SELECT bool_and(
                EXISTS (
                    SELECT 1
                    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                    JOIN pg_roles r ON r.oid = acl.grantee
                    WHERE r.rolname = 'service_role' AND acl.privilege_type = 'EXECUTE'
                )
            )
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
        ) AS service_role_granted,
        (
            SELECT bool_and(
                NOT EXISTS (
                    SELECT 1
                    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                    LEFT JOIN pg_roles r ON r.oid = acl.grantee
                    WHERE (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
                      AND acl.privilege_type = 'EXECUTE'
                )
            )
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
        ) AS public_revoked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
),
target_sale_audit AS (
    SELECT
        s.id AS sale_id,
        s.receipt_no,
        s.status AS sale_status,
        (
            SELECT COUNT(*)
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id AND m.movement_type = 'satis'
        ) AS satis_movement_count,
        (
            SELECT COUNT(*)
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id AND m.movement_type = 'iptal'
        ) AS iptal_movement_count
    FROM public.kasa_sales s
    WHERE s.receipt_no = 'FS-20260902-00060'
)
SELECT jsonb_build_object(
    'postflight_timestamp', now(),
    'overall_ok', (
        (SELECT table_exists AND rls_enabled FROM permissions_table_audit)
        AND (SELECT COUNT(*) = 1 AND bool_and(has_cancel_permission) AND bool_and(role = 'personel') AND bool_and(is_active) FROM bahar_user_audit)
        AND (SELECT unauthorized_staff_with_permission_count = 0 FROM other_staff_audit)
        AND (SELECT overload_count_is_one AND canonical_signature_matches AND sales_update_block_valid_and_clean AND is_security_definer AND has_safe_search_path AND service_role_granted AND public_revoked FROM fn_audit)
        AND (SELECT sale_status = 'completed' AND satis_movement_count = 1 AND iptal_movement_count = 0 FROM target_sale_audit)
    ),
    'permissions_table_valid', (SELECT table_exists AND rls_enabled FROM permissions_table_audit),
    'bahar_permission_granted', (SELECT COUNT(*) = 1 AND bool_and(has_cancel_permission) AND bool_and(role = 'personel') AND bool_and(is_active) FROM bahar_user_audit),
    'other_staff_isolated', (SELECT unauthorized_staff_with_permission_count = 0 FROM other_staff_audit),
    'fn_cancel_sale_schema_clean', (SELECT overload_count_is_one AND canonical_signature_matches AND sales_update_block_valid_and_clean AND is_security_definer AND has_safe_search_path AND service_role_granted AND public_revoked FROM fn_audit),
    'target_sale_intact_and_ready', (SELECT sale_status = 'completed' AND satis_movement_count = 1 AND iptal_movement_count = 0 FROM target_sale_audit),
    'details', jsonb_build_object(
        'bahar_user', (SELECT jsonb_agg(to_jsonb(b)) FROM bahar_user_audit b),
        'other_staff_stats', (SELECT to_jsonb(o) FROM other_staff_audit o),
        'target_sale', (SELECT to_jsonb(t) FROM target_sale_audit t),
        'sales_update_block', (SELECT jsonb_build_object('start_ord', start_ord, 'end_ord', end_ord, 'block_text', block_text) FROM sales_update_block LIMIT 1),
        'fn_cancel_sale_catalog', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'oid', p.oid,
                    'proname', p.proname,
                    'pronargs', p.pronargs,
                    'identity_args', pg_get_function_identity_arguments(p.oid)
                )
            )
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_cancel_sale'
        )
    )
) AS postflight_result;
