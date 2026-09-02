-- ============================================================================
-- HurCELL Kasa V12 - Satış İptal Yetkisi ve RPC Sözleşmesi Preflight SQL (Salt-Okunur)
-- Amaç:
--  1. fn_kasa_cancel_sale fonksiyonunun canlı katalogdaki imza, argüman ve ACL durumunu teşhis etmek.
--  2. FS-20260902-00061 satışının durumunu, bağlı kasa gününü ve hareketlerini denetlemek.
--  3. Bahar kullanıcısını benzersiz UUID, rol ve aktiflik bilgileriyle tespit etmek.
--  4. Mevcut yetki şeması durumunu kontrol etmek.
-- KESİN KURAL: Salt-okunur CTE yapısı, DDL/DML/RPC içermez.
-- ============================================================================

WITH cancel_fn_catalog AS (
    SELECT
        p.oid,
        p.proname,
        p.pronargs,
        p.proargnames,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_get_function_arguments(p.oid) AS full_arguments,
        p.prosecdef AS is_security_definer,
        p.proconfig AS function_config,
        array_to_string(p.proacl, ', ') AS acl_raw,
        pg_get_functiondef(p.oid) AS function_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_cancel_sale'
),
target_sale_audit AS (
    SELECT
        s.id AS sale_id,
        s.receipt_no,
        s.product_name,
        s.quantity,
        s.unit_price_kurus,
        s.total_price_kurus,
        s.cash_paid_kurus,
        s.card_paid_kurus,
        s.bank_transfer_paid_kurus,
        s.status AS sale_status,
        s.created_at AS sale_created_at,
        s.kasa_day_id,
        d.date_val AS day_date,
        d.status AS day_status,
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
        ) AS existing_movements,
        (
            SELECT COUNT(*)
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id
        ) AS movement_count,
        (
            SELECT COUNT(*)
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id AND m.movement_type = 'iptal'
        ) AS iptal_movement_count
    FROM public.kasa_sales s
    LEFT JOIN public.kasa_days d ON d.id = s.kasa_day_id
    WHERE s.receipt_no = 'FS-20260902-00061'
),
bahar_user_candidates AS (
    SELECT
        u.id AS user_id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at
    FROM public.kasa_users u
    WHERE u.username ILIKE '%bahar%'
       OR u.full_name ILIKE '%bahar%'
),
schema_audit AS (
    SELECT
        to_regclass('public.kasa_user_permissions') IS NOT NULL AS permissions_table_exists,
        to_regclass('public.kasa_users') IS NOT NULL AS users_table_exists,
        to_regclass('public.kasa_audit_logs') IS NOT NULL AS audit_logs_table_exists
)
SELECT jsonb_build_object(
    'preflight_timestamp', now(),
    'preflight_status', CASE
        WHEN (SELECT COUNT(*) FROM bahar_user_candidates WHERE is_active = true) = 0 THEN 'BLOCKED_USER_NOT_FOUND'
        WHEN (SELECT COUNT(*) FROM bahar_user_candidates WHERE is_active = true) > 1 THEN 'BLOCKED_AMBIGUOUS_USER'
        WHEN (SELECT sale_id FROM target_sale_audit) IS NULL THEN 'BLOCKED_SALE_NOT_FOUND'
        WHEN (SELECT sale_status FROM target_sale_audit) <> 'completed' THEN 'BLOCKED_SALE_NOT_COMPLETED'
        ELSE 'READY_FOR_PERMISSION_GRANT'
    END,
    'blockers', (
        SELECT COALESCE(jsonb_agg(b), '[]'::jsonb)
        FROM (
            SELECT 'Aktif Bahar kullanıcısı bulunamadı' AS b WHERE (SELECT COUNT(*) FROM bahar_user_candidates WHERE is_active = true) = 0
            UNION ALL
            SELECT 'Birden fazla aktif Bahar kullanıcısı bulundu (belirsizlik)' AS b WHERE (SELECT COUNT(*) FROM bahar_user_candidates WHERE is_active = true) > 1
            UNION ALL
            SELECT 'FS-20260902-00061 satışı bulunamadı' AS b WHERE (SELECT sale_id FROM target_sale_audit) IS NULL
            UNION ALL
            SELECT 'FS-20260902-00061 satışı completed durumunda değil' AS b WHERE (SELECT sale_status FROM target_sale_audit) IS NOT NULL AND (SELECT sale_status FROM target_sale_audit) <> 'completed'
        ) blocker_list(b)
    ),
    'candidate_user', (
        SELECT jsonb_build_object(
            'user_id', c.user_id,
            'username', c.username,
            'full_name', c.full_name,
            'role', c.role,
            'is_active', c.is_active,
            'created_at', c.created_at
        )
        FROM bahar_user_candidates c
        WHERE c.is_active = true
        LIMIT 1
    ),
    'all_bahar_matches', (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'user_id', c.user_id,
                    'username', c.username,
                    'full_name', c.full_name,
                    'role', c.role,
                    'is_active', c.is_active,
                    'created_at', c.created_at
                )
            ),
            '[]'::jsonb
        )
        FROM bahar_user_candidates c
    ),
    'target_sale', (
        SELECT jsonb_build_object(
            'sale_id', tsa.sale_id,
            'receipt_no', tsa.receipt_no,
            'product_name', tsa.product_name,
            'quantity', tsa.quantity,
            'total_price_kurus', tsa.total_price_kurus,
            'cash_paid_kurus', tsa.cash_paid_kurus,
            'card_paid_kurus', tsa.card_paid_kurus,
            'bank_transfer_paid_kurus', tsa.bank_transfer_paid_kurus,
            'sale_status', tsa.sale_status,
            'sale_created_at', tsa.sale_created_at,
            'kasa_day_id', tsa.kasa_day_id,
            'day_date', tsa.day_date,
            'day_status', tsa.day_status,
            'movement_count', tsa.movement_count,
            'iptal_movement_count', tsa.iptal_movement_count,
            'existing_movements', tsa.existing_movements
        )
        FROM target_sale_audit tsa
    ),
    'cancel_fn_catalog', (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'oid', f.oid,
                    'proname', f.proname,
                    'pronargs', f.pronargs,
                    'proargnames', f.proargnames,
                    'identity_arguments', f.identity_arguments,
                    'full_arguments', f.full_arguments,
                    'is_security_definer', f.is_security_definer,
                    'function_config', f.function_config,
                    'acl_raw', f.acl_raw
                )
            ),
            '[]'::jsonb
        )
        FROM cancel_fn_catalog f
    ),
    'schema_audit', (
        SELECT jsonb_build_object(
            'permissions_table_exists', sa.permissions_table_exists,
            'users_table_exists', sa.users_table_exists,
            'audit_logs_table_exists', sa.audit_logs_table_exists
        )
        FROM schema_audit sa
    )
) AS preflight_result;
