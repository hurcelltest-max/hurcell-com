-- ============================================================================
-- HurCELL Kasa V14 - Satış Düzeltme (Sale Update) Salt-Okunur Preflight SQL
-- Amaç:
--  1. Production'daki tüm fn_kasa_update_sale overloadlarını listelemek.
--  2. İmzaları (identity_arguments, full_arguments, defaults, SECURITY DEFINER, search_path, ACL) raporlamak.
--  3. Fonksiyon gövdesini salt-okunur olarak teşhis etmek.
--  4. Uygulamanın gönderdiği 32 parametreli sözleşme ile katalog imzası arasındaki farkları (özellikle p_product_name, p_idempotency_key, updated_at) belirlemek.
--  5. FS-20260902-00061 satışının durumunu, gün durumunu ve hareketlerini denetlemek.
-- KESİN KURAL: Salt-okunur CTE yapısı, DDL/DML/RPC çağrısı İÇERMEZ.
-- ============================================================================

WITH fn_update_catalog AS (
    SELECT
        p.oid,
        p.proname,
        p.pronargs,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_get_function_arguments(p.oid) AS full_arguments,
        p.prosecdef AS is_security_definer,
        (pg_get_functiondef(p.oid) LIKE '%search_path%public%pg_temp%') AS has_safe_search_path,
        (pg_get_function_arguments(p.oid) LIKE '%p_product_name%') AS has_product_name_arg,
        (pg_get_function_arguments(p.oid) LIKE '%p_idempotency_key%') AS has_idempotency_key_arg,
        (pg_get_functiondef(p.oid) LIKE '%updated_at = now()%') AS contains_updated_at_ref,
        pg_get_functiondef(p.oid) AS function_def,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'grantee', r.rolname,
                    'privilege', acl.privilege_type
                )
            )
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            LEFT JOIN pg_roles r ON r.oid = acl.grantee
        ) AS acl_permissions
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_update_sale'
),
target_sale_audit AS (
    SELECT
        s.id AS sale_id,
        s.receipt_no,
        s.product_name,
        s.quantity,
        s.unit_price_kurus,
        s.total_price_kurus,
        s.cost_price_kurus,
        s.service_cost_kurus,
        s.cash_paid_kurus,
        s.card_paid_kurus,
        s.bank_transfer_paid_kurus,
        s.status AS sale_status,
        s.created_at AS sale_created_at,
        s.created_by_user_id,
        s.kasa_day_id,
        d.date_val AS day_date,
        d.status AS day_status,
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
        ) AS duzeltme_movement_count,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'movement_id', m.id,
                    'movement_type', m.movement_type,
                    'amount_kurus', m.amount_kurus,
                    'cash_portion_kurus', m.cash_portion_kurus,
                    'card_portion_kurus', m.card_portion_kurus,
                    'bank_transfer_portion_kurus', m.bank_transfer_portion_kurus,
                    'created_at', m.created_at
                )
            )
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id
        ) AS movements
    FROM public.kasa_sales s
    LEFT JOIN public.kasa_days d ON d.id = s.kasa_day_id
    WHERE s.receipt_no = 'FS-20260902-00061'
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
        ) AS has_cancel_permission,
        EXISTS (
            SELECT 1
            FROM public.kasa_user_permissions up
            WHERE up.user_id = u.id
              AND up.permission_key = 'kasa.sale.update'
              AND up.is_allowed = true
              AND up.revoked_at IS NULL
        ) AS has_update_permission
    FROM public.kasa_users u
    WHERE u.id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
)
SELECT jsonb_build_object(
    'preflight_timestamp', now(),
    'preflight_status', CASE
        WHEN (SELECT COUNT(*) FROM target_sale_audit) = 0 THEN 'BLOCKED_SALE_NOT_FOUND'
        WHEN (SELECT sale_status FROM target_sale_audit) <> 'completed' THEN 'BLOCKED_SALE_NOT_COMPLETED'
        WHEN (SELECT day_status FROM target_sale_audit) <> 'open' THEN 'BLOCKED_DAY_NOT_OPEN'
        WHEN (SELECT COUNT(*) FROM fn_update_catalog WHERE has_product_name_arg = true) = 0 THEN 'READY_FOR_V14_UPDATE_CONTRACT_FIX'
        ELSE 'READY_FOR_V14_INSPECTION'
    END,
    'blockers', (
        SELECT COALESCE(jsonb_agg(b), '[]'::jsonb)
        FROM (
            SELECT 'FS-20260902-00061 satışı bulunamadı' AS b WHERE (SELECT COUNT(*) FROM target_sale_audit) = 0
            UNION ALL
            SELECT 'FS-20260902-00061 satışı completed durumunda değil' AS b WHERE (SELECT sale_status FROM target_sale_audit) IS NOT NULL AND (SELECT sale_status FROM target_sale_audit) <> 'completed'
            UNION ALL
            SELECT 'FS-20260902-00061 gün durumu open değil' AS b WHERE (SELECT day_status FROM target_sale_audit) IS NOT NULL AND (SELECT day_status FROM target_sale_audit) <> 'open'
        ) blocker_list(b)
    ),
    'fn_update_overload_count', (SELECT COUNT(*) FROM fn_update_catalog),
    'fn_update_catalog', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'oid', f.oid,
                'proname', f.proname,
                'pronargs', f.pronargs,
                'identity_arguments', f.identity_arguments,
                'has_product_name_arg', f.has_product_name_arg,
                'has_idempotency_key_arg', f.has_idempotency_key_arg,
                'is_security_definer', f.is_security_definer,
                'has_safe_search_path', f.has_safe_search_path,
                'contains_updated_at_ref', f.contains_updated_at_ref,
                'acl_permissions', f.acl_permissions
            )
        )
        FROM fn_update_catalog f
    ),
    'target_sale', (
        SELECT jsonb_build_object(
            'sale_id', tsa.sale_id,
            'receipt_no', tsa.receipt_no,
            'product_name', tsa.product_name,
            'total_price_kurus', tsa.total_price_kurus,
            'sale_status', tsa.sale_status,
            'created_by_user_id', tsa.created_by_user_id,
            'day_date', tsa.day_date,
            'day_status', tsa.day_status,
            'satis_movement_count', tsa.satis_movement_count,
            'iptal_movement_count', tsa.iptal_movement_count,
            'duzeltme_movement_count', tsa.duzeltme_movement_count,
            'movements', tsa.movements
        )
        FROM target_sale_audit tsa
    ),
    'bahar_permissions', (
        SELECT jsonb_build_object(
            'user_id', b.user_id,
            'username', b.username,
            'full_name', b.full_name,
            'role', b.role,
            'is_active', b.is_active,
            'has_cancel_permission', b.has_cancel_permission,
            'has_update_permission', b.has_update_permission
        )
        FROM bahar_user_audit b
    )
) AS preflight_result;
