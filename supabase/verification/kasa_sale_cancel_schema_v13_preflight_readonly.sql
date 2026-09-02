-- ============================================================================
-- HurCELL Kasa V13 - Satış İptali Şema Teşhis Preflight SQL (Salt-Okunur)
-- Amaç:
--  1. public.kasa_sales tablosunun mevcut gerçek kolonlarını listelemek (updated_at var mı?).
--  2. Canlı fn_kasa_cancel_sale fonksiyon tanımını ve içindeki kasa_sales UPDATE ifadesini teşhis etmek.
--  3. FS-20260902-00060 satışının durumunu, bağlı gününü ve hareketlerini denetlemek.
--  4. V12 başarısız denemesinin atomik rollback olduğunu, kısmi finansal hareket kalmadığını doğrulamak.
-- KESİN KURAL: Salt-okunur CTE yapısı, DDL/DML/RPC içermez.
-- ============================================================================

WITH sales_columns_catalog AS (
    SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kasa_sales'
    ORDER BY ordinal_position
),
fn_cancel_catalog AS (
    SELECT
        p.oid,
        p.proname,
        p.pronargs,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_get_function_arguments(p.oid) AS full_arguments,
        p.prosecdef AS is_security_definer,
        pg_get_functiondef(p.oid) AS function_def,
        (pg_get_functiondef(p.oid) LIKE '%updated_at%') AS contains_updated_at_ref
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
            SELECT jsonb_agg(
                jsonb_build_object(
                    'movement_id', m.id,
                    'movement_type', m.movement_type,
                    'amount_kurus', m.amount_kurus,
                    'cash_portion_kurus', m.cash_portion_kurus,
                    'card_portion_kurus', m.card_portion_kurus,
                    'created_at', m.created_at
                )
            )
            FROM public.kasa_movements m
            WHERE m.sale_id = s.id
        ) AS movements
    FROM public.kasa_sales s
    LEFT JOIN public.kasa_days d ON d.id = s.kasa_day_id
    WHERE s.receipt_no = 'FS-20260902-00060'
),
bahar_permission_audit AS (
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
)
SELECT jsonb_build_object(
    'preflight_timestamp', now(),
    'preflight_status', CASE
        WHEN (SELECT COUNT(*) FROM target_sale_audit) = 0 THEN 'BLOCKED_SALE_NOT_FOUND'
        WHEN (SELECT sale_status FROM target_sale_audit) <> 'completed' THEN 'BLOCKED_SALE_NOT_COMPLETED'
        WHEN (SELECT iptal_movement_count FROM target_sale_audit) > 0 THEN 'BLOCKED_PARTIAL_MUTATION_DETECTED'
        ELSE 'READY_FOR_V13_SCHEMA_FIX'
    END,
    'blockers', (
        SELECT COALESCE(jsonb_agg(b), '[]'::jsonb)
        FROM (
            SELECT 'FS-20260902-00060 satışı bulunamadı' AS b WHERE (SELECT COUNT(*) FROM target_sale_audit) = 0
            UNION ALL
            SELECT 'FS-20260902-00060 satışı completed durumunda değil' AS b WHERE (SELECT sale_status FROM target_sale_audit) IS NOT NULL AND (SELECT sale_status FROM target_sale_audit) <> 'completed'
            UNION ALL
            SELECT 'FS-20260902-00060 satışında iptal hareketi tespit edildi (kısmi işlem)' AS b WHERE (SELECT iptal_movement_count FROM target_sale_audit) > 0
        ) blocker_list(b)
    ),
    'kasa_sales_has_updated_at', EXISTS (
        SELECT 1 FROM sales_columns_catalog WHERE column_name = 'updated_at'
    ),
    'kasa_sales_columns', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'column_name', c.column_name,
                'data_type', c.data_type,
                'is_nullable', c.is_nullable
            )
        )
        FROM sales_columns_catalog c
    ),
    'target_sale', (
        SELECT jsonb_build_object(
            'sale_id', tsa.sale_id,
            'receipt_no', tsa.receipt_no,
            'product_name', tsa.product_name,
            'total_price_kurus', tsa.total_price_kurus,
            'sale_status', tsa.sale_status,
            'day_date', tsa.day_date,
            'day_status', tsa.day_status,
            'satis_movement_count', tsa.satis_movement_count,
            'iptal_movement_count', tsa.iptal_movement_count,
            'movements', tsa.movements
        )
        FROM target_sale_audit tsa
    ),
    'bahar_permission', (
        SELECT jsonb_build_object(
            'user_id', b.user_id,
            'username', b.username,
            'full_name', b.full_name,
            'role', b.role,
            'is_active', b.is_active,
            'has_cancel_permission', b.has_cancel_permission
        )
        FROM bahar_permission_audit b
    ),
    'fn_cancel_audit', (
        SELECT jsonb_build_object(
            'pronargs', f.pronargs,
            'identity_arguments', f.identity_arguments,
            'contains_updated_at_ref', f.contains_updated_at_ref
        )
        FROM fn_cancel_catalog f
    )
) AS preflight_result;
