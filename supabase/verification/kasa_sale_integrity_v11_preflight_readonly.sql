-- ============================================================================
-- Verification: kasa_sale_integrity_v11_preflight_readonly.sql
-- Description: HurCELL Kasa V11 Salt Okunur Preflight Teşhis ve Güvenlik Denetimi
-- Production Güvenliği: Kesinlikle salt okunurdur, hiçbir veri/şema değiştirmez.
-- ============================================================================

WITH expected_sales (
    sale_id,
    receipt_no,
    product_name,
    expected_kasa_day_id,
    expected_istanbul_date,
    expected_total_kurus,
    expected_cash_kurus,
    expected_card_kurus,
    expected_bank_kurus
) AS (
    VALUES
    -- 6 Wrong-Day Sales (2026-09-01 tarihinde yapılmış ancak 2026-08-31 gününe bağlanmış)
    ('7529de8e-41d8-4881-8bb7-7481a2ec756e'::uuid, 'FS-20260831-00042', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 18000::bigint, 18000::bigint, 0::bigint, 0::bigint),
    ('b30856ff-e4b5-4f1d-847e-c8677d614bd2'::uuid, 'FS-20260831-00043', 'Aksesuar', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 35000::bigint, 35000::bigint, 0::bigint, 0::bigint),
    ('79eaf836-ebac-47a2-8d93-2b99c2aa3508'::uuid, 'FS-20260831-00044', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 9000::bigint, 9000::bigint, 0::bigint, 0::bigint),
    ('846e97d8-9e50-4aac-ac05-75170d2433cb'::uuid, 'FS-20260831-00045', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 22000::bigint, 22000::bigint, 0::bigint, 0::bigint),
    ('3d5a4441-f739-4b71-8c28-98cb0b2544cc'::uuid, 'FS-20260831-00046', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 2000::bigint, 2000::bigint, 0::bigint, 0::bigint),
    ('9dbccf6c-3a00-4a79-9c8a-fd2da5c92a96'::uuid, 'FS-20260831-00047', 'Teknik Servis', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 380000::bigint, 380000::bigint, 0::bigint, 0::bigint),
    -- 9 Missing-Movement Sales (2026-09-01 gününe doğru bağlı fakat hareketi eksik)
    ('bf8f64b3-a54a-4a33-99e7-4b54e8e4cc1f'::uuid, 'FS-20260901-00048', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 500::bigint, 500::bigint, 0::bigint, 0::bigint),
    ('fc688eb3-0cc3-491f-be9e-ae2048b60589'::uuid, 'FS-20260901-00049', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 30000::bigint, 30000::bigint, 0::bigint, 0::bigint),
    ('c7ac9307-cfef-4078-a95a-1b6ba8119903'::uuid, 'FS-20260901-00050', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 40000::bigint, 40000::bigint, 0::bigint, 0::bigint),
    ('a71b06a1-f433-42cb-a4bc-abad01451eb3'::uuid, 'FS-20260901-00051', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 50000::bigint, 50000::bigint, 0::bigint, 0::bigint),
    ('092f4006-5e65-460f-b364-542a30df06e8'::uuid, 'FS-20260901-00052', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 5000::bigint, 5000::bigint, 0::bigint, 0::bigint),
    ('f191072f-3331-4be7-9f33-6f61be6ce42e'::uuid, 'FS-20260901-00055', 'Teknik Servis', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 350000::bigint, 350000::bigint, 0::bigint, 0::bigint),
    ('151a2d9e-6cc9-4b2d-85de-3fbb03a30dec'::uuid, 'FS-20260901-00057', 'Teknik Servis', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 410500::bigint, 0::bigint, 410500::bigint, 0::bigint),
    ('ff8563c7-922e-4921-befc-89e60a0725e9'::uuid, 'FS-20260901-00058', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 30000::bigint, 30000::bigint, 0::bigint, 0::bigint),
    ('4e9f04af-5822-4996-aa5e-ca72acc211af'::uuid, 'FS-20260901-00059', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 40000::bigint, 0::bigint, 40000::bigint, 0::bigint)
),
expected_sales_math_audit AS (
    SELECT
        COUNT(*) AS total_count,
        COUNT(DISTINCT sale_id) AS distinct_sale_ids,
        COUNT(DISTINCT receipt_no) AS distinct_receipt_nos,
        COUNT(*) FILTER (WHERE receipt_no IS NULL OR TRIM(receipt_no) = '') AS null_receipt_nos,
        COUNT(*) FILTER (WHERE product_name IS NULL OR TRIM(product_name) = '') AS null_product_names,
        
        COUNT(*) FILTER (WHERE expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745') AS wrong_day_count,
        COALESCE(SUM(expected_total_kurus) FILTER (WHERE expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745'), 0) AS wrong_day_total_kurus,
        COALESCE(SUM(expected_cash_kurus) FILTER (WHERE expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745'), 0) AS wrong_day_cash_kurus,
        COALESCE(SUM(expected_card_kurus) FILTER (WHERE expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745'), 0) AS wrong_day_card_kurus,
        COALESCE(SUM(expected_bank_kurus) FILTER (WHERE expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745'), 0) AS wrong_day_bank_kurus,
        
        COUNT(*) FILTER (WHERE expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a') AS sep_01_count,
        COALESCE(SUM(expected_total_kurus) FILTER (WHERE expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'), 0) AS sep_01_total_kurus,
        COALESCE(SUM(expected_cash_kurus) FILTER (WHERE expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'), 0) AS sep_01_cash_kurus,
        COALESCE(SUM(expected_card_kurus) FILTER (WHERE expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'), 0) AS sep_01_card_kurus,
        COALESCE(SUM(expected_bank_kurus) FILTER (WHERE expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'), 0) AS sep_01_bank_kurus,
        
        COALESCE(SUM(expected_total_kurus), 0) AS grand_total_kurus,
        COALESCE(SUM(expected_cash_kurus), 0) AS grand_cash_kurus,
        COALESCE(SUM(expected_card_kurus), 0) AS grand_card_kurus,
        COALESCE(SUM(expected_bank_kurus), 0) AS grand_bank_kurus
    FROM expected_sales
),
days_audit AS (
    SELECT
        COUNT(*) FILTER (WHERE d.status = 'open') AS open_days_count,
        EXISTS (
            SELECT 1 FROM public.kasa_days d1
            WHERE d1.id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND d1.date_val = '2026-09-01'
              AND d1.status = 'open'
              AND d1.opening_balance_kurus = 1413000
              AND d1.opened_at = '2026-09-01 15:16:06.215524+00'::timestamptz
        ) AS day_2026_09_01_valid,
        EXISTS (
            SELECT 1 FROM public.kasa_days d2
            WHERE d2.id = '52126414-3835-4277-8d83-be73284a7745'
              AND d2.date_val = '2026-08-31'
              AND d2.status = 'closed'
              AND d2.opening_balance_kurus = 1007000
              AND d2.expected_cash_kurus = 1413000
              AND d2.counted_cash_kurus = 1413000
              AND d2.cash_difference_kurus = 0
              AND d2.closed_at = '2026-09-01 15:16:05.269309+00'::timestamptz
        ) AS day_2026_08_31_valid,
        (
            SELECT COUNT(*) FROM public.kasa_movements m
            WHERE m.kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND m.movement_type = 'acilis_bakiyesi'
        ) AS sep_01_opening_movement_count,
        (
            SELECT COALESCE(SUM(m.amount_kurus), 0) FROM public.kasa_movements m
            WHERE m.kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND m.movement_type = 'acilis_bakiyesi'
        ) AS sep_01_opening_movement_amount_kurus,
        (SELECT jsonb_agg(to_jsonb(d3)) FROM public.kasa_days d3 WHERE d3.date_val IN ('2026-08-31', '2026-09-01')) AS target_days_details
    FROM public.kasa_days d
),
target_sales_match AS (
    SELECT
        e.sale_id,
        e.receipt_no AS exp_receipt_no,
        s.receipt_no AS act_receipt_no,
        e.product_name AS exp_product_name,
        s.product_name AS act_product_name,
        e.expected_kasa_day_id,
        s.kasa_day_id AS act_kasa_day_id,
        e.expected_istanbul_date,
        (s.created_at AT TIME ZONE 'Europe/Istanbul')::date AS act_istanbul_date,
        e.expected_total_kurus,
        s.total_price_kurus AS act_total_kurus,
        e.expected_cash_kurus,
        s.cash_paid_kurus AS act_cash_kurus,
        e.expected_card_kurus,
        s.card_paid_kurus AS act_card_kurus,
        e.expected_bank_kurus,
        s.bank_transfer_paid_kurus AS act_bank_kurus,
        s.status AS act_status,
        (SELECT COUNT(*) FROM public.kasa_movements m WHERE m.sale_id = s.id AND m.movement_type = 'satis') AS act_satis_movement_count,
        (
            s.id IS NOT NULL
            AND s.receipt_no = e.receipt_no
            AND s.product_name = e.product_name
            AND s.kasa_day_id = e.expected_kasa_day_id
            AND (s.created_at AT TIME ZONE 'Europe/Istanbul')::date = e.expected_istanbul_date
            AND s.total_price_kurus = e.expected_total_kurus
            AND s.cash_paid_kurus = e.expected_cash_kurus
            AND s.card_paid_kurus = e.expected_card_kurus
            AND s.bank_transfer_paid_kurus = e.expected_bank_kurus
            AND s.status = 'completed'
            AND (SELECT COUNT(*) FROM public.kasa_movements m WHERE m.sale_id = s.id AND m.movement_type = 'satis') = 0
        ) AS is_exact_match
    FROM expected_sales e
    LEFT JOIN public.kasa_sales s ON s.id = e.sale_id
),
wrong_day_sales AS (
    SELECT s.* FROM target_sales_match s
    WHERE s.expected_kasa_day_id = '52126414-3835-4277-8d83-be73284a7745'
),
missing_mov_sales AS (
    SELECT s.* FROM target_sales_match s
    WHERE s.expected_kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
),
wrong_day_summary AS (
    SELECT
        COUNT(*) AS count,
        COALESCE(SUM(act_total_kurus), 0) AS total_kurus,
        COALESCE(SUM(act_cash_kurus), 0) AS cash_kurus,
        COALESCE(SUM(act_card_kurus), 0) AS card_kurus,
        COALESCE(SUM(act_bank_kurus), 0) AS bank_kurus,
        COALESCE(SUM(act_satis_movement_count), 0) AS total_movements,
        COUNT(*) FILTER (WHERE act_status <> 'completed') AS non_completed_count,
        COUNT(*) FILTER (WHERE act_kasa_day_id <> '52126414-3835-4277-8d83-be73284a7745') AS wrong_day_mismatch_count,
        COUNT(*) FILTER (WHERE act_istanbul_date <> '2026-09-01') AS date_mismatch_count,
        COUNT(*) FILTER (WHERE NOT is_exact_match) AS exact_mismatch_count
    FROM wrong_day_sales
),
missing_mov_summary AS (
    SELECT
        COUNT(*) AS count,
        COALESCE(SUM(act_total_kurus), 0) AS total_kurus,
        COALESCE(SUM(act_cash_kurus), 0) AS cash_kurus,
        COALESCE(SUM(act_card_kurus), 0) AS card_kurus,
        COALESCE(SUM(act_bank_kurus), 0) AS bank_kurus,
        COALESCE(SUM(act_satis_movement_count), 0) AS total_movements,
        COUNT(*) FILTER (WHERE act_status <> 'completed') AS non_completed_count,
        COUNT(*) FILTER (WHERE act_kasa_day_id <> 'cdf1e244-c0e8-4fb5-8f52-14302627257a') AS day_mismatch_count,
        COUNT(*) FILTER (WHERE act_istanbul_date <> '2026-09-01') AS date_mismatch_count,
        COUNT(*) FILTER (WHERE NOT is_exact_match) AS exact_mismatch_count
    FROM missing_mov_sales
),
legacy_discrepancy_details AS (
    SELECT
        s.id AS sale_id,
        s.receipt_no,
        s.total_price_kurus,
        s.cash_paid_kurus AS sale_cash_kurus,
        s.card_paid_kurus AS sale_card_kurus,
        m.id AS movement_id,
        m.amount_kurus AS movement_amount_kurus,
        m.cash_portion_kurus AS movement_cash_kurus,
        m.card_portion_kurus AS movement_card_kurus,
        (
            s.id = '6e911920-e90b-451e-ba54-bccc35668d89'
            AND s.total_price_kurus = 40000
            AND s.cash_paid_kurus = 40000
            AND s.card_paid_kurus = 0
            AND m.id IS NOT NULL
            AND m.amount_kurus = 40000
            AND m.cash_portion_kurus = 0
            AND m.card_portion_kurus = 40000
        ) AS is_sale1_valid,
        (
            s.id = '9d4fc9fe-4232-4429-be3a-1cbdd1336e31'
            AND s.total_price_kurus = 65000
            AND s.cash_paid_kurus = 65000
            AND s.card_paid_kurus = 0
            AND m.id IS NOT NULL
            AND m.amount_kurus = 65000
            AND m.cash_portion_kurus = 0
            AND m.card_portion_kurus = 65000
        ) AS is_sale2_valid
    FROM public.kasa_sales s
    LEFT JOIN public.kasa_movements m ON m.sale_id = s.id AND m.movement_type = 'satis'
    WHERE s.id IN ('6e911920-e90b-451e-ba54-bccc35668d89', '9d4fc9fe-4232-4429-be3a-1cbdd1336e31')
),
legacy_discrepancy_audit AS (
    SELECT
        (SELECT COUNT(*) FROM legacy_discrepancy_details) = 2 AS exact_two_legacy_rows,
        EXISTS (SELECT 1 FROM legacy_discrepancy_details WHERE is_sale1_valid) AS legacy_sale1_exact_match,
        EXISTS (SELECT 1 FROM legacy_discrepancy_details WHERE is_sale2_valid) AS legacy_sale2_exact_match,
        (SELECT jsonb_agg(to_jsonb(l)) FROM legacy_discrepancy_details l) AS legacy_details
),
other_sales_audit AS (
    SELECT
        COUNT(*) FILTER (
            WHERE s.id NOT IN (SELECT sale_id FROM expected_sales)
              AND s.id NOT IN ('6e911920-e90b-451e-ba54-bccc35668d89', '9d4fc9fe-4232-4429-be3a-1cbdd1336e31')
              AND s.status = 'completed'
              AND NOT EXISTS (
                SELECT 1 FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
            )
        ) AS unmanaged_sales_without_satis_movement,
        COUNT(*) FILTER (
            WHERE s.id NOT IN (SELECT sale_id FROM expected_sales)
              AND s.status = 'completed'
              AND (
                SELECT COUNT(*) FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
            ) > 1
        ) AS unmanaged_sales_with_duplicate_satis_movement,
        COUNT(*) FILTER (
            WHERE s.id NOT IN (SELECT sale_id FROM expected_sales)
              AND s.id NOT IN ('6e911920-e90b-451e-ba54-bccc35668d89', '9d4fc9fe-4232-4429-be3a-1cbdd1336e31')
              AND s.status = 'completed'
              AND EXISTS (
                SELECT 1 FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
                  AND (
                    m.amount_kurus <> s.total_price_kurus
                    OR m.cash_portion_kurus <> s.cash_paid_kurus
                    OR m.card_portion_kurus <> s.card_paid_kurus
                    OR m.bank_transfer_portion_kurus <> s.bank_transfer_paid_kurus
                  )
            )
        ) AS unmanaged_sales_with_movement_amount_mismatch
    FROM public.kasa_sales s
),
fn_cat AS (
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
        (SELECT COUNT(*) FROM fn_cat) AS create_sale_overloads_count,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32) AS canonical_32_exists,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 31) AS wrapper_31_exists,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND prosecdef = true) AS canonical_32_security_definer,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 31 AND prosecdef = true) AS wrapper_31_security_definer,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef LIKE '%search_path%public%pg_temp%') AS canonical_32_safe_search_path,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 31 AND funcdef LIKE '%search_path%public%pg_temp%') AS wrapper_31_safe_search_path,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef ~* 'INSERT\s+INTO\s+public\.kasa_sales') AS canonical_inserts_sales,
        EXISTS (SELECT 1 FROM fn_cat WHERE pronargs = 32 AND funcdef ~* 'INSERT\s+INTO\s+public\.kasa_movements') AS canonical_already_inserts_movements,
        EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_assert_active_day_for_mutation'
        ) AS chronological_guard_already_exists
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
        ) AS public_anon_authenticated_revoked,
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
        ) = 2 AS service_role_allowed_for_both_overloads
),
constraint_audit AS (
    SELECT 
        EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public' 
              AND t.relname = 'kasa_movements' 
              AND c.conname = 'chk_kasa_movements_type'
              AND pg_get_constraintdef(c.oid) LIKE '%''satis''%'
              AND pg_get_constraintdef(c.oid) LIKE '%''ts_cost_cash_payment''%'
              AND pg_get_constraintdef(c.oid) LIKE '%''acilis_bakiyesi''%'
        ) AS movement_types_allowed
),
blockers_calc AS (
    SELECT
        ARRAY_REMOVE(ARRAY[
            -- 1. expected_sales CTE içsel matematik doğrulaması
            CASE WHEN (SELECT total_count FROM expected_sales_math_audit) <> 15 THEN 'BLOCKER: expected_sales CTE içinde tam olarak 15 kayıt bulunmalıdır.' END,
            CASE WHEN (SELECT distinct_sale_ids FROM expected_sales_math_audit) <> 15 THEN 'BLOCKER: expected_sales CTE içinde tekrarlanan sale_id tespit edildi.' END,
            CASE WHEN (SELECT distinct_receipt_nos FROM expected_sales_math_audit) <> 15 THEN 'BLOCKER: expected_sales CTE içinde tekrarlanan receipt_no tespit edildi.' END,
            CASE WHEN (SELECT null_receipt_nos FROM expected_sales_math_audit) > 0 THEN 'BLOCKER: expected_sales CTE içinde NULL/boş receipt_no tespit edildi.' END,
            CASE WHEN (SELECT null_product_names FROM expected_sales_math_audit) > 0 THEN 'BLOCKER: expected_sales CTE içinde NULL/boş product_name tespit edildi.' END,
            CASE WHEN (SELECT wrong_day_count FROM expected_sales_math_audit) <> 6 OR (SELECT wrong_day_total_kurus FROM expected_sales_math_audit) <> 466000 OR (SELECT wrong_day_cash_kurus FROM expected_sales_math_audit) <> 466000 OR (SELECT wrong_day_card_kurus FROM expected_sales_math_audit) <> 0 OR (SELECT wrong_day_bank_kurus FROM expected_sales_math_audit) <> 0 THEN 'BLOCKER: expected_sales içindeki 6 yanlış-gün satışı matematiği 466000 kuruş nakit olmalıdır.' END,
            CASE WHEN (SELECT sep_01_count FROM expected_sales_math_audit) <> 9 OR (SELECT sep_01_total_kurus FROM expected_sales_math_audit) <> 956000 OR (SELECT sep_01_cash_kurus FROM expected_sales_math_audit) <> 505500 OR (SELECT sep_01_card_kurus FROM expected_sales_math_audit) <> 450500 OR (SELECT sep_01_bank_kurus FROM expected_sales_math_audit) <> 0 THEN 'BLOCKER: expected_sales içindeki 9 adet 1 Eylül satışı matematiği (956000 toplam / 505500 nakit / 450500 kart) uyuşmuyor.' END,
            CASE WHEN (SELECT grand_total_kurus FROM expected_sales_math_audit) <> 1422000 OR (SELECT grand_cash_kurus FROM expected_sales_math_audit) <> 971500 OR (SELECT grand_card_kurus FROM expected_sales_math_audit) <> 450500 OR (SELECT grand_bank_kurus FROM expected_sales_math_audit) <> 0 THEN 'BLOCKER: expected_sales genel toplam matematiği (1422000 toplam / 971500 nakit / 450500 kart) uyuşmuyor.' END,

            -- 2. Kasa Günleri ve Başlangıç Değerleri Doğrulaması
            CASE WHEN (SELECT open_days_count FROM days_audit) <> 1 THEN 'BLOCKER: Sistemde tam olarak 1 adet açık gün olmalıdır.' END,
            CASE WHEN NOT (SELECT day_2026_09_01_valid FROM days_audit) THEN 'BLOCKER: 2026-09-01 kasa günü açık, beklenen ID (cdf1e244-c0e8-4fb5-8f52-14302627257a), 1413000 kuruş başlangıç bakiyesi veya açılış timestampi ile eşleşmiyor.' END,
            CASE WHEN NOT (SELECT day_2026_08_31_valid FROM days_audit) THEN 'BLOCKER: 2026-08-31 kasa günü kapalı, beklenen ID (52126414-3835-4277-8d83-be73284a7745), 1007000 açılış / 1413000 kapanış / 0 fark değerleri veya kapanış timestampi ile eşleşmiyor.' END,
            CASE WHEN (SELECT sep_01_opening_movement_count FROM days_audit) <> 1 OR (SELECT sep_01_opening_movement_amount_kurus FROM days_audit) <> 1413000 THEN 'BLOCKER: 1 Eylül günü için beklenen başlangıç açılış hareketi (tam 1 adet acilis_bakiyesi ve 1413000 kuruş) doğrulanamadı.' END,

            -- 3. Canlı Satış Tablosu ile Exact Eşleşme Doğrulaması
            CASE WHEN (SELECT count FROM wrong_day_summary) <> 6 THEN 'BLOCKER: 31 Ağustosa yanlış bağlanan 6 satışın tamamı bulunamadı.' END,
            CASE WHEN (SELECT exact_mismatch_count FROM wrong_day_summary) > 0 THEN 'BLOCKER: Yanlış-gün 6 satıştan beklenen tam değerlerle (receipt_no, product_name, tutar, kanal, gün, tarih) uyuşmayan kayıtlar var.' END,
            CASE WHEN (SELECT date_mismatch_count FROM wrong_day_summary) > 0 THEN 'BLOCKER: Yanlış-gün 6 satıştan İstanbul oluşturulma tarihi 2026-09-01 olmayan kayıtlar var.' END,
            CASE WHEN (SELECT wrong_day_mismatch_count FROM wrong_day_summary) > 0 THEN 'BLOCKER: Yanlış-gün satışlarından mevcut kasa_day_id si 31 Ağustos ID si ile eşleşmeyen kayıtlar var.' END,
            CASE WHEN (SELECT non_completed_count FROM wrong_day_summary) > 0 THEN 'BLOCKER: Yanlış-gün satışlarından completed olmayan kayıtlar var.' END,
            CASE WHEN (SELECT total_movements FROM wrong_day_summary) > 0 THEN 'BLOCKER: Yanlış-gün satışlarına ait önceden oluşturulmuş satis hareketi bulundu (beklenen: 0).' END,
            CASE WHEN (SELECT total_kurus FROM wrong_day_summary) <> 466000 OR (SELECT cash_kurus FROM wrong_day_summary) <> 466000 OR (SELECT card_kurus FROM wrong_day_summary) <> 0 OR (SELECT bank_kurus FROM wrong_day_summary) <> 0 THEN 'BLOCKER: Canlı tablodaki 6 yanlış-gün satışının toplam tutarı tam olarak 466000 kuruş nakit olmalıdır (kart/banka: 0).' END,

            CASE WHEN (SELECT count FROM missing_mov_summary) <> 9 THEN 'BLOCKER: 1 Eylüle bağlı eksik-hareketli 9 satışın tamamı bulunamadı.' END,
            CASE WHEN (SELECT exact_mismatch_count FROM missing_mov_summary) > 0 THEN 'BLOCKER: 1 Eylül 9 satıştan beklenen tam değerlerle (receipt_no, product_name, tutar, kanal, gün, tarih) uyuşmayan kayıtlar var.' END,
            CASE WHEN (SELECT day_mismatch_count FROM missing_mov_summary) > 0 THEN 'BLOCKER: Eksik-hareketli satışlardan mevcut kasa_day_id si 1 Eylül ID si ile eşleşmeyen kayıtlar var.' END,
            CASE WHEN (SELECT non_completed_count FROM missing_mov_summary) > 0 THEN 'BLOCKER: 1 Eylül satışlarından completed olmayan kayıtlar var.' END,
            CASE WHEN (SELECT total_movements FROM missing_mov_summary) > 0 THEN 'BLOCKER: 1 Eylül eksik-hareketli satışlarına ait önceden oluşturulmuş satis hareketi bulundu (beklenen: 0).' END,
            CASE WHEN (SELECT total_kurus FROM missing_mov_summary) <> 956000 OR (SELECT cash_kurus FROM missing_mov_summary) <> 505500 OR (SELECT card_kurus FROM missing_mov_summary) <> 450500 OR (SELECT bank_kurus FROM missing_mov_summary) <> 0 THEN 'BLOCKER: Canlı tablodaki 9 satış toplamları (956000 toplam / 505500 nakit / 450500 kart / 0 banka) uyuşmuyor.' END,

            -- 4. Diğer Satışlar ve 27 Ağustos Eski Uyumsuz Kayıtlar
            CASE WHEN (SELECT unmanaged_sales_without_satis_movement FROM other_sales_audit) > 0 THEN 'BLOCKER: Hedef 15 satış ve muaf 2 kayıt dışında hareketi eksik başka tamamlanmış satışlar bulundu.' END,
            CASE WHEN (SELECT unmanaged_sales_with_duplicate_satis_movement FROM other_sales_audit) > 0 THEN 'BLOCKER: Mükerrer satis hareketi olan satışlar bulundu.' END,
            CASE WHEN (SELECT unmanaged_sales_with_movement_amount_mismatch FROM other_sales_audit) > 0 THEN 'BLOCKER: Satış ile movement arasında tutar/kanal uyumsuzluğu olan unmanaged satışlar bulundu.' END,
            CASE WHEN NOT (SELECT exact_two_legacy_rows FROM legacy_discrepancy_audit) OR NOT (SELECT legacy_sale1_exact_match FROM legacy_discrepancy_audit) OR NOT (SELECT legacy_sale2_exact_match FROM legacy_discrepancy_audit) THEN 'BLOCKER: 27 Ağustos tarihli 2 eski uyumsuz kaydın beklenen bireysel yapısı (6e911920: 400 TL satış nakit / hareket kart, 9d4fc9fe: 650 TL satış nakit / hareket kart, 1 er hareket) doğrulanamadı.' END,

            -- 5. Fonksiyon, Güvenlik ve Constraint Durumu
            CASE WHEN (SELECT create_sale_overloads_count FROM fn_audit) <> 2 OR NOT (SELECT canonical_32_exists FROM fn_audit) OR NOT (SELECT wrapper_31_exists FROM fn_audit) THEN 'BLOCKER: fn_kasa_create_sale için beklenen 2 overload (32 canonical ve 31 wrapper) mevcut değil.' END,
            CASE WHEN NOT (SELECT canonical_32_security_definer FROM fn_audit) OR NOT (SELECT wrapper_31_security_definer FROM fn_audit) OR NOT (SELECT canonical_32_safe_search_path FROM fn_audit) OR NOT (SELECT wrapper_31_safe_search_path FROM fn_audit) THEN 'BLOCKER: fn_kasa_create_sale overloadlarının SECURITY DEFINER veya search_path ayarları güvenli değil.' END,
            CASE WHEN NOT (SELECT public_anon_authenticated_revoked FROM acl_audit) OR NOT (SELECT service_role_allowed_for_both_overloads FROM acl_audit) THEN 'BLOCKER: fn_kasa_create_sale yetkilendirmesi beklenen durumda değil (public/anon/auth kapalı, service_role her iki overload için açık olmalı).' END,
            CASE WHEN NOT (SELECT canonical_inserts_sales FROM fn_audit) THEN 'BLOCKER: Mevcut canonical fonksiyon kasa_sales tablosuna INSERT yapmıyor.' END,
            CASE WHEN (SELECT canonical_already_inserts_movements FROM fn_audit) THEN 'BLOCKER: Mevcut canonical fonksiyon zaten kasa_movements kaydı üretiyor (başlangıç durumu beklenenden farklı).' END,
            CASE WHEN (SELECT chronological_guard_already_exists FROM fn_audit) THEN 'BLOCKER: fn_kasa_assert_active_day_for_mutation kronolojik gün kilidi zaten mevcut (başlangıç durumu beklenenden farklı).' END,
            CASE WHEN NOT (SELECT movement_types_allowed FROM constraint_audit) THEN 'BLOCKER: chk_kasa_movements_type constrainti satis, ts_cost_cash_payment veya acilis_bakiyesi türlerine izin vermiyor.' END
        ], NULL) AS blockers,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN (SELECT exact_two_legacy_rows FROM legacy_discrepancy_audit) AND (SELECT legacy_sale1_exact_match FROM legacy_discrepancy_audit) AND (SELECT legacy_sale2_exact_match FROM legacy_discrepancy_audit) THEN 'WARNING: 27 Ağustos tarihli 2 satış kaydı (6e911920: 400 TL, 9d4fc9fe: 650 TL) satışta nakit, harekette kart olarak tam eşleşmeyle doğrulandı. Bu kayıtlar muaf tutulmuş olup migration bunlara dokunmayacaktır.' END
        ], NULL) AS warnings
)
SELECT 
    jsonb_build_object(
        'preflight_status', CASE WHEN CARDINALITY(bc.blockers) = 0 THEN 'READY_FOR_V11_MIGRATION' ELSE 'BLOCKED' END,
        'blockers', bc.blockers,
        'warnings', bc.warnings,
        'summary_totals', jsonb_build_object(
            'wrong_day_sales_count', wds.count,
            'wrong_day_total_kurus', wds.total_kurus,
            'wrong_day_cash_kurus', wds.cash_kurus,
            'missing_movement_sales_count', mms.count,
            'missing_movement_total_kurus', mms.total_kurus,
            'missing_movement_cash_kurus', mms.cash_kurus,
            'missing_movement_card_kurus', mms.card_kurus,
            'grand_target_sales_count', wds.count + mms.count,
            'grand_target_total_kurus', wds.total_kurus + mms.total_kurus,
            'grand_target_cash_kurus', wds.cash_kurus + mms.cash_kurus,
            'grand_target_card_kurus', wds.card_kurus + mms.card_kurus,
            'august_31_corrected_closing_expected_kurus', 947000,
            'september_01_corrected_opening_expected_kurus', 947000
        ),
        'days_audit', (SELECT target_days_details FROM days_audit),
        'opening_movement_audit', jsonb_build_object(
            'sep_01_opening_movement_count', (SELECT sep_01_opening_movement_count FROM days_audit),
            'sep_01_opening_movement_amount_kurus', (SELECT sep_01_opening_movement_amount_kurus FROM days_audit)
        ),
        'wrong_day_sales_list', (SELECT jsonb_agg(to_jsonb(w)) FROM wrong_day_sales w),
        'missing_movement_sales_list', (SELECT jsonb_agg(to_jsonb(m)) FROM missing_mov_sales m),
        'legacy_discrepancy_details', (SELECT legacy_details FROM legacy_discrepancy_audit)
    ) AS preflight_diagnostic_report
FROM wrong_day_summary wds
CROSS JOIN missing_mov_summary mms
CROSS JOIN blockers_calc bc;
