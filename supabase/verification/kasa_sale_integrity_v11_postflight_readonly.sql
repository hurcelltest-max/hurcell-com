-- ============================================================================
-- Verification: kasa_sale_integrity_v11_postflight_readonly.sql
-- Description: HurCELL Kasa V11 Salt Okunur Postflight Doğrulama Sorgusu
-- Production Güvenliği: Kesinlikle salt okunurdur, hiçbir sabit true içermez,
--                      tüm kontroller gerçek katalog ve tablo sorgularından hesaplanır.
-- ============================================================================

WITH days_audit AS (
    SELECT
        EXISTS (
            SELECT 1 FROM public.kasa_days
            WHERE id = '52126414-3835-4277-8d83-be73284a7745'
              AND date_val = '2026-08-31'
              AND status = 'closed'
              AND opening_balance_kurus = 1007000
              AND expected_cash_kurus = 947000
              AND counted_cash_kurus = 947000
              AND cash_difference_kurus = 0
        ) AS aug_31_values_valid,
        EXISTS (
            SELECT 1 FROM public.kasa_days
            WHERE id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND date_val = '2026-09-01'
              AND status = 'open'
              AND opening_balance_kurus = 947000
        ) AS sep_01_values_valid,
        (
            SELECT COUNT(*) = 1 AND COALESCE(SUM(amount_kurus), 0) = 947000
            FROM public.kasa_movements
            WHERE kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND movement_type = 'acilis_bakiyesi'
        ) AS sep_01_opening_movement_valid,
        NOT EXISTS (
            SELECT 1 FROM public.kasa_movements
            WHERE kasa_day_id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
              AND movement_type = 'capital_injection'
              AND created_at >= '2026-09-01 15:16:06+00'
        ) AS no_unwanted_capital_injection,
        (SELECT jsonb_agg(to_jsonb(d)) FROM public.kasa_days d WHERE d.date_val IN ('2026-08-31', '2026-09-01')) AS days_details
),
target_sales_audit AS (
    SELECT
        COUNT(*) = 15 AS all_15_sales_present,
        COUNT(*) FILTER (WHERE s.kasa_day_id <> 'cdf1e244-c0e8-4fb5-8f52-14302627257a') = 0 AS all_15_sales_on_sep_01,
        COUNT(*) FILTER (
            WHERE (
                SELECT COUNT(*) FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
            ) <> 1
        ) = 0 AS all_15_sales_have_single_satis_movement,
        COUNT(*) FILTER (
            WHERE EXISTS (
                SELECT 1 FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
                  AND (
                    m.amount_kurus <> s.total_price_kurus
                    OR m.cash_portion_kurus <> s.cash_paid_kurus
                    OR m.card_portion_kurus <> s.card_paid_kurus
                    OR m.bank_transfer_portion_kurus <> s.bank_transfer_paid_kurus
                  )
            )
        ) = 0 AS all_15_movement_amounts_match,
        COALESCE(SUM(s.total_price_kurus), 0) = 1422000 AS total_ciro_match,
        COALESCE(SUM(s.cash_paid_kurus), 0) = 971500 AS total_cash_match,
        COALESCE(SUM(s.card_paid_kurus), 0) = 450500 AS total_card_match
    FROM public.kasa_sales s
    WHERE s.id IN (
        '7529de8e-41d8-4881-8bb7-7481a2ec756e',
        'b30856ff-e4b5-4f1d-847e-c8677d614bd2',
        '79eaf836-ebac-47a2-8d93-2b99c2aa3508',
        '846e97d8-9e50-4aac-ac05-75170d2433cb',
        '3d5a4441-f739-4b71-8c28-98cb0b2544cc',
        '9dbccf6c-3a00-4a79-9c8a-fd2da5c92a96',
        'bf8f64b3-a54a-4a33-99e7-4b54e8e4cc1f',
        'fc688eb3-0cc3-491f-be9e-ae2048b60589',
        'c7ac9307-cfef-4078-a95a-1b6ba8119903',
        'a71b06a1-f433-42cb-a4bc-abad01451eb3',
        '092f4006-5e65-460f-b364-542a30df06e8',
        'f191072f-3331-4be7-9f33-6f61be6ce42e',
        '151a2d9e-6cc9-4b2d-85de-3fbb03a30dec',
        'ff8563c7-922e-4921-befc-89e60a0725e9',
        '4e9f04af-5822-4996-aa5e-ca72acc211af'
    )
),
all_sales_audit AS (
    SELECT
        COUNT(*) FILTER (
            WHERE s.id NOT IN ('6e911920-e90b-451e-ba54-bccc35668d89', '9d4fc9fe-4232-4429-be3a-1cbdd1336e31')
              AND s.status = 'completed'
              AND NOT EXISTS (
                SELECT 1 FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
            )
        ) AS unmanaged_sales_without_satis_movement_count,
        COUNT(*) FILTER (
            WHERE (
                SELECT COUNT(*) FROM public.kasa_movements m
                WHERE m.sale_id = s.id AND m.movement_type = 'satis'
            ) > 1
        ) AS completed_sales_with_duplicate_satis_movement_count
    FROM public.kasa_sales s
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
audit_logs_check AS (
    SELECT
        EXISTS (SELECT 1 FROM public.kasa_audit_logs WHERE action = 'kasa_gunu_devir_onarimi') AS devir_audit_exists,
        EXISTS (SELECT 1 FROM public.kasa_audit_logs WHERE action = 'kasa_gunu_acilis_onarimi') AS acilis_audit_exists,
        (SELECT COUNT(*) FROM public.kasa_audit_logs WHERE action = 'satis_gun_tasi_onarimi') = 6 AS gun_tasi_audit_count_is_6,
        (SELECT COUNT(*) FROM public.kasa_audit_logs WHERE action = 'satis_movement_olusturuldu') = 15 AS movement_audit_count_is_15
),
guard_fn AS (
    SELECT 
        p.proname,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_assert_active_day_for_mutation'
),
create_sale_fns AS (
    SELECT 
        p.proname,
        p.pronargs,
        p.prosecdef,
        pg_get_function_identity_arguments(p.oid) AS idargs,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
),
create_expense_fn AS (
    SELECT 
        p.proname,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_expense'
),
collect_credit_fn AS (
    SELECT 
        p.proname,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_collect_credit_payment'
),
deposit_bank_fn AS (
    SELECT 
        p.proname,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_deposit_to_bank'
),
inject_capital_fn AS (
    SELECT 
        p.proname,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_inject_capital'
),
fn_audit AS (
    SELECT 
        EXISTS (SELECT 1 FROM guard_fn) AS chronological_guard_exists,
        COALESCE((SELECT prosecdef FROM guard_fn LIMIT 1), false) AS chronological_guard_security_definer,
        COALESCE((SELECT funcdef LIKE '%search_path%public%pg_temp%' FROM guard_fn LIMIT 1), false) AS chronological_guard_safe_search_path,
        (SELECT COUNT(*) FROM create_sale_fns) = 2 AS overloads_count_is_two,
        EXISTS (
            SELECT 1 FROM create_sale_fns 
            WHERE idargs LIKE '%p_product_name text%' 
              AND funcdef ~* 'insert[[:space:]]+into[[:space:]]+public[.]kasa_sales'
        ) AS canonical_create_sale_inserts_sales,
        EXISTS (
            SELECT 1 FROM create_sale_fns 
            WHERE idargs LIKE '%p_product_name text%' 
              AND funcdef ~* 'insert[[:space:]]+into[[:space:]]+public[.]kasa_movements'
              AND funcdef ~* 'kasa_day_id[[:space:]]*,[[:space:]]*movement_type[[:space:]]*,[[:space:]]*sale_id'
              AND funcdef ~* '''satis'''
              AND funcdef ~* 'v_sale_id'
        ) AS canonical_create_sale_inserts_movements,
        EXISTS (
            SELECT 1 FROM create_sale_fns 
            WHERE idargs LIKE '%p_product_name text%' 
              AND funcdef ~* 'insert[[:space:]]+into[[:space:]]+public[.]kasa_movements'
              AND funcdef ~* 'insert[[:space:]]+into[[:space:]]+public[.]kasa_sales'
        ) AS sale_and_movement_are_atomic,
        EXISTS (
            SELECT 1 FROM create_sale_fns 
            WHERE idargs LIKE '%p_product_name text%' 
              AND funcdef ~* 'fn_kasa_assert_active_day_for_mutation'
        ) AS sale_uses_chronological_guard,
        EXISTS (SELECT 1 FROM create_expense_fn WHERE funcdef ~* 'fn_kasa_assert_active_day_for_mutation') AS expense_uses_chronological_guard,
        EXISTS (SELECT 1 FROM collect_credit_fn WHERE funcdef ~* 'fn_kasa_assert_active_day_for_mutation') AS credit_payment_uses_chronological_guard,
        EXISTS (SELECT 1 FROM deposit_bank_fn WHERE funcdef ~* 'fn_kasa_assert_active_day_for_mutation') AS deposit_to_bank_uses_chronological_guard,
        EXISTS (SELECT 1 FROM inject_capital_fn WHERE funcdef ~* 'fn_kasa_assert_active_day_for_mutation') AS inject_capital_uses_chronological_guard
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
              AND p.proname IN ('fn_kasa_assert_active_day_for_mutation', 'fn_kasa_create_sale', 'fn_kasa_create_expense', 'fn_kasa_collect_credit_payment', 'fn_kasa_deposit_to_bank', 'fn_kasa_inject_capital')
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
              AND p.proname IN ('fn_kasa_assert_active_day_for_mutation', 'fn_kasa_create_sale', 'fn_kasa_create_expense', 'fn_kasa_collect_credit_payment', 'fn_kasa_deposit_to_bank', 'fn_kasa_inject_capital')
              AND r.rolname = 'service_role'
              AND acl.privilege_type = 'EXECUTE'
        ) >= 8 AS service_role_allowed_for_all_functions
)
SELECT 
    jsonb_build_object(
        'overall_ok', (
            da.aug_31_values_valid
            AND da.sep_01_values_valid
            AND da.sep_01_opening_movement_valid
            AND da.no_unwanted_capital_injection
            AND tsa.all_15_sales_present
            AND tsa.all_15_sales_on_sep_01
            AND tsa.all_15_sales_have_single_satis_movement
            AND tsa.all_15_movement_amounts_match
            AND tsa.total_ciro_match
            AND tsa.total_cash_match
            AND tsa.total_card_match
            AND asa.unmanaged_sales_without_satis_movement_count = 0
            AND asa.completed_sales_with_duplicate_satis_movement_count = 0
            AND lda.exact_two_legacy_rows
            AND lda.legacy_sale1_exact_match
            AND lda.legacy_sale2_exact_match
            AND alc.devir_audit_exists
            AND alc.acilis_audit_exists
            AND alc.gun_tasi_audit_count_is_6
            AND alc.movement_audit_count_is_15
            AND fa.chronological_guard_exists
            AND fa.chronological_guard_security_definer
            AND fa.chronological_guard_safe_search_path
            AND fa.overloads_count_is_two
            AND fa.canonical_create_sale_inserts_sales
            AND fa.canonical_create_sale_inserts_movements
            AND fa.sale_and_movement_are_atomic
            AND fa.sale_uses_chronological_guard
            AND fa.expense_uses_chronological_guard
            AND fa.credit_payment_uses_chronological_guard
            AND fa.deposit_to_bank_uses_chronological_guard
            AND fa.inject_capital_uses_chronological_guard
            AND aa.public_anon_authenticated_revoked
            AND aa.service_role_allowed_for_all_functions
        ),
        'days_integrity', jsonb_build_object(
            'aug_31_values_valid', da.aug_31_values_valid,
            'sep_01_values_valid', da.sep_01_values_valid,
            'sep_01_opening_movement_valid', da.sep_01_opening_movement_valid,
            'no_unwanted_capital_injection', da.no_unwanted_capital_injection
        ),
        'target_sales_repair_audit', jsonb_build_object(
            'all_15_sales_present', tsa.all_15_sales_present,
            'all_15_sales_on_sep_01', tsa.all_15_sales_on_sep_01,
            'all_15_sales_have_single_satis_movement', tsa.all_15_sales_have_single_satis_movement,
            'all_15_movement_amounts_match', tsa.all_15_movement_amounts_match,
            'total_ciro_match', tsa.total_ciro_match,
            'total_cash_match', tsa.total_cash_match,
            'total_card_match', tsa.total_card_match
        ),
        'other_sales_audit', jsonb_build_object(
            'unmanaged_sales_without_satis_movement_count', asa.unmanaged_sales_without_satis_movement_count,
            'completed_sales_with_duplicate_satis_movement_count', asa.completed_sales_with_duplicate_satis_movement_count
        ),
        'audit_logs_audit', jsonb_build_object(
            'devir_audit_exists', alc.devir_audit_exists,
            'acilis_audit_exists', alc.acilis_audit_exists,
            'gun_tasi_audit_count_is_6', alc.gun_tasi_audit_count_is_6,
            'movement_audit_count_is_15', alc.movement_audit_count_is_15
        ),
        'fn_and_guard_audit', jsonb_build_object(
            'chronological_guard_exists', fa.chronological_guard_exists,
            'chronological_guard_security_definer', fa.chronological_guard_security_definer,
            'canonical_create_sale_inserts_sales', fa.canonical_create_sale_inserts_sales,
            'canonical_create_sale_inserts_movements', fa.canonical_create_sale_inserts_movements,
            'sale_and_movement_are_atomic', fa.sale_and_movement_are_atomic,
            'sale_uses_chronological_guard', fa.sale_uses_chronological_guard,
            'expense_uses_chronological_guard', fa.expense_uses_chronological_guard,
            'credit_payment_uses_chronological_guard', fa.credit_payment_uses_chronological_guard,
            'deposit_to_bank_uses_chronological_guard', fa.deposit_to_bank_uses_chronological_guard,
            'inject_capital_uses_chronological_guard', fa.inject_capital_uses_chronological_guard
        ),
        'security_acl_audit', jsonb_build_object(
            'public_anon_authenticated_revoked', aa.public_anon_authenticated_revoked,
            'service_role_allowed_for_all_functions', aa.service_role_allowed_for_all_functions
        ),
        'legacy_warnings', ARRAY[
            'WARNING: 27 Ağustos tarihli 2 satış (6e911920: 400 TL, 9d4fc9fe: 650 TL) satışta nakit / harekette kart görünmektedir. Bu kayıtlar muaf tutulmuş olup migration bunlara dokunmamıştır.'
        ]
    ) AS postflight_verification_report
FROM days_audit da
CROSS JOIN target_sales_audit tsa
CROSS JOIN all_sales_audit asa
CROSS JOIN legacy_discrepancy_audit lda
CROSS JOIN audit_logs_check alc
CROSS JOIN fn_audit fa
CROSS JOIN acl_audit aa;
