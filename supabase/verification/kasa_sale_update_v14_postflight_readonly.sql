-- ============================================================================
-- HurCELL Kasa V14 - Satış Düzeltme (Sale Update) Salt-Okunur Postflight SQL
-- Amaç:
--  1. fn_kasa_update_sale fonksiyonunun tekil kanonik imzaya sahip olduğunu doğrulamak.
--  2. Eski 31-parametreli overload'un kalmadığını doğrulamak (count = 0).
--  3. İki aşamalı sales_update_start ve sales_update_bounds CTE'si ile public.kasa_sales UPDATE
--     bloğunda updated_at bulunmadığını doğrulamak.
--  4. Fonksiyonun satis_duzeltme_iptal ve satis_duzeltme_yeni append-only hareketlerini ürettiğini,
--     orijinal satis hareketini UPDATE/DELETE etmediğini teyit etmek.
--  5. SECURITY DEFINER, search_path = public, pg_temp, REVOKE ALL ve GRANT service_role'u doğrulamak.
--  6. FS-20260902-00061 hedef satışının durumunun (completed, satis=1, iptal=0) bozulmadığını teyit etmek.
-- KESİN KURAL: Dinamik denetim, sıfır hardcoded true, salt-okunur CTE yapısı.
-- ============================================================================

WITH fn_lines AS (
    SELECT
        p.oid,
        line_text,
        ord
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') WITH ORDINALITY AS t(line_text, ord)
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_update_sale'
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
        COUNT(*) = 1 AS single_overload_exists,
        COUNT(*) FILTER (WHERE p.pronargs = 31) = 0 AS old_31_arg_overload_removed,
        EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'fn_kasa_update_sale'
              AND pg_get_function_arguments(p.oid) LIKE '%p_product_name%'
              AND pg_get_function_arguments(p.oid) LIKE '%p_idempotency_key%'
              AND pg_get_functiondef(p.oid) LIKE '%satis_duzeltme_iptal%'
              AND pg_get_functiondef(p.oid) LIKE '%satis_duzeltme_yeni%'
              AND NOT (pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?kasa_movements\s+SET[\s\S]*?movement_type\s*=\s*''satis''')
        ) AS canonical_signature_matches_and_append_only,
        EXISTS (
            SELECT 1
            FROM sales_update_block sub
            WHERE sub.block_text IS NOT NULL
              AND sub.start_ord IS NOT NULL
              AND sub.end_ord IS NOT NULL
              AND sub.end_ord > sub.start_ord
              AND POSITION('updated_at' IN LOWER(sub.block_text)) = 0
              AND POSITION('product_name' IN LOWER(sub.block_text)) > 0
              AND POSITION('category_id' IN LOWER(sub.block_text)) > 0
              AND POSITION('total_price_kurus' IN LOWER(sub.block_text)) > 0
        ) AS sales_update_block_valid_and_clean,
        (
            SELECT bool_and(p.prosecdef)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
        ) AS is_security_definer,
        (
            SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%search_path%public%pg_temp%')
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
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
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
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
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
        ) AS public_revoked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
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
        ) AS iptal_movement_count,
        (
            SELECT COUNT(*)
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id AND m.movement_type IN ('satis_duzeltme_iptal', 'satis_duzeltme_yeni')
        ) AS duzeltme_movement_count
    FROM public.kasa_sales s
    WHERE s.receipt_no = 'FS-20260902-00061'
)
SELECT jsonb_build_object(
    'postflight_timestamp', now(),
    'overall_ok', (
        (SELECT single_overload_exists AND old_31_arg_overload_removed AND canonical_signature_matches_and_append_only AND sales_update_block_valid_and_clean AND is_security_definer AND has_safe_search_path AND service_role_granted AND public_revoked FROM fn_audit)
        AND (SELECT sale_status = 'completed' AND satis_movement_count = 1 AND iptal_movement_count = 0 AND duzeltme_movement_count = 0 FROM target_sale_audit)
    ),
    'fn_update_sale_contract_clean', (SELECT single_overload_exists AND old_31_arg_overload_removed AND canonical_signature_matches_and_append_only AND sales_update_block_valid_and_clean AND is_security_definer AND has_safe_search_path AND service_role_granted AND public_revoked FROM fn_audit),
    'target_sale_intact_and_ready', (SELECT sale_status = 'completed' AND satis_movement_count = 1 AND iptal_movement_count = 0 AND duzeltme_movement_count = 0 FROM target_sale_audit),
    'details', jsonb_build_object(
        'target_sale', (SELECT to_jsonb(t) FROM target_sale_audit t),
        'sales_update_block', (SELECT jsonb_build_object('start_ord', start_ord, 'end_ord', end_ord, 'block_text', block_text) FROM sales_update_block LIMIT 1),
        'fn_update_sale_catalog', (
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
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_update_sale'
        )
    )
) AS postflight_result;
