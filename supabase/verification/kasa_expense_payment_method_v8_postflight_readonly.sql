-- ============================================================================
-- HURCELL KASA V8 POSTFLIGHT READ-ONLY AUDIT QUERY
-- ============================================================================
-- KONUM: supabase/verification/kasa_expense_payment_method_v8_postflight_readonly.sql
-- %100 SALT OKUNUR (READ-ONLY) SORGUDUR. VERİTABANINDA HİÇBİR YAZMA YAPMAZ.
-- ============================================================================

WITH cols_audit AS (
    SELECT 
        (
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'kasa_expenses' 
              AND column_name IN ('payment_method', 'bank_account_id', 'bank_transaction_id', 'idempotency_key')
        ) = 4 AS four_columns_ok
),
categories_canonical_audit AS (
    SELECT 
        -- 7 canonical categories must exist, be active, and have exact display orders 1..7
        (
            SELECT COUNT(*)
            FROM public.kasa_expense_categories c
            WHERE c.is_active = true
              AND (
                (c.name = 'Personel Maaşı' AND c.display_order = 1 AND c.is_salary_category = true) OR
                (c.name = 'Teknik Servis' AND c.display_order = 2 AND c.is_salary_category = false) OR
                (c.name = 'Yemek' AND c.display_order = 3 AND c.is_salary_category = false) OR
                (c.name = 'Kırtasiye' AND c.display_order = 4 AND c.is_salary_category = false) OR
                (c.name = 'Malzeme' AND c.display_order = 5 AND c.is_salary_category = false) OR
                (c.name = 'Temizlik / Ofis Gideri' AND c.display_order = 6 AND c.is_salary_category = false) OR
                (c.name = 'Diğer' AND c.display_order = 7 AND c.is_salary_category = false)
              )
        ) = 7 AS canonical_categories_ok,
        -- No duplicate active category names
        (
            SELECT COUNT(*) 
            FROM (
                SELECT lower(trim(name)) 
                FROM public.kasa_expense_categories 
                WHERE is_active = true 
                GROUP BY lower(trim(name)) 
                HAVING COUNT(*) > 1
            ) dup
        ) = 0 AS duplicate_categories_absent,
        -- No duplicate display_order
        (
            SELECT COUNT(*) 
            FROM (
                SELECT display_order 
                FROM public.kasa_expense_categories 
                GROUP BY display_order 
                HAVING COUNT(*) > 1
            ) dup_order
        ) = 0 AS duplicate_display_orders_absent,
        -- All expenses are linked to active categories (no orphans or unremapped passives)
        (
            SELECT COUNT(*)
            FROM public.kasa_expenses e
            JOIN public.kasa_expense_categories c ON c.id = e.expense_category_id
            WHERE c.is_active = false
        ) = 0 AS linked_expenses_remapped_ok,
        -- Category cross-remap absent: no expense is linked to an unmapped or cross-contaminated category
        (
            SELECT COUNT(*)
            FROM public.kasa_expenses e
            JOIN public.kasa_expense_categories c ON c.id = e.expense_category_id
            WHERE c.is_active = false
               OR c.name LIKE '%(Pasif Birleştirilmiş%'
        ) = 0 AS category_cross_remap_absent,
        -- Ambiguous legacy categories count: active categories in 1..7 that are not canonical
        (
            SELECT COUNT(*)
            FROM public.kasa_expense_categories
            WHERE is_active = true
              AND name NOT IN ('Personel Maaşı', 'Teknik Servis', 'Yemek', 'Kırtasiye', 'Malzeme', 'Temizlik / Ofis Gideri', 'Diğer')
              AND display_order <= 7
        ) AS ambiguous_legacy_categories_count
),
cam_silme_target AS (
    SELECT 
        e.id AS target_id, 
        e.amount_kurus, 
        e.status,
        e.payment_method, 
        e.bank_account_id, 
        e.bank_transaction_id, 
        e.expense_category_id
    FROM public.kasa_days d
    JOIN public.kasa_expenses e ON e.kasa_day_id = d.id 
    WHERE d.date_val = DATE '2026-08-31'
      AND e.amount_kurus = 10000
      AND e.description ILIKE '%cam silme%'
    LIMIT 1
),
cam_silme_audit AS (
    SELECT 
        (
            SELECT COUNT(*)
            FROM public.kasa_expenses ex
            JOIN public.kasa_days dx ON dx.id = ex.kasa_day_id
            WHERE dx.date_val = DATE '2026-08-31'
              AND ex.amount_kurus = 10000
              AND ex.description ILIKE '%cam silme%'
        ) AS cam_silme_exact_target_count,
        (SELECT payment_method FROM cam_silme_target) AS cam_silme_payment_method,
        ((SELECT payment_method FROM cam_silme_target) = 'cash') AS cam_silme_payment_method_cash_ok,
        ((SELECT bank_account_id FROM cam_silme_target) IS NULL) AS cam_silme_bank_account_null_ok,
        ((SELECT bank_transaction_id FROM cam_silme_target) IS NULL) AS cam_silme_bank_transaction_null_ok,
        (
            SELECT COUNT(*)
            FROM public.kasa_bank_transactions t
            WHERE t.related_expense_id = (SELECT target_id FROM cam_silme_target)
        ) AS cam_silme_any_related_bank_tx_count,
        (
            (SELECT COUNT(*) FROM public.kasa_bank_transactions t WHERE t.related_expense_id = (SELECT target_id FROM cam_silme_target)) = 0
        ) AS cam_silme_no_related_bank_tx_ok,
        EXISTS (
            SELECT 1 FROM public.kasa_expense_categories c
            WHERE c.id = (SELECT expense_category_id FROM cam_silme_target)
              AND c.name = 'Temizlik / Ofis Gideri'
              AND c.is_active = true
        ) AS cam_silme_category_ok
),
cash_components_audit AS (
    SELECT 
        d.id AS day_id,
        d.opening_balance_kurus,
        d.capital_injected_kurus,
        d.owner_withdrawn_kurus,
        COALESCE((SELECT SUM(s.cash_paid_kurus) FROM public.kasa_sales s WHERE s.kasa_day_id = d.id AND s.status = 'completed'), 0) AS cash_sales,
        COALESCE((SELECT SUM(cp.cash_paid_kurus) FROM public.kasa_credit_payments cp WHERE cp.kasa_day_id = d.id), 0) AS cash_credit,
        COALESCE((SELECT SUM(fx.tl_equivalent_kurus) FROM public.kasa_fx_transactions fx WHERE fx.kasa_day_id = d.id AND fx.transaction_type = 'fx_conversion_to_try'), 0) AS fx_try,
        COALESCE((SELECT SUM(m.cash_portion_kurus) FROM public.kasa_movements m WHERE m.kasa_day_id = d.id AND m.movement_type = 'ts_cost_cash_refund'), 0) AS ts_in,
        COALESCE((SELECT SUM(m.cash_portion_kurus) FROM public.kasa_movements m WHERE m.kasa_day_id = d.id AND m.movement_type = 'bank_to_cash'), 0) AS bank_to_cash,
        COALESCE((SELECT SUM(e.amount_kurus) FROM public.kasa_expenses e WHERE e.kasa_day_id = d.id AND (e.status = 'active' OR e.status IS NULL) AND e.payment_method = 'cash'), 0) AS active_cash_exp,
        COALESCE((SELECT SUM(bd.amount_kurus) FROM public.kasa_bank_deposits bd WHERE bd.kasa_day_id = d.id), 0) AS deposits,
        COALESCE((SELECT SUM(ABS(m.cash_portion_kurus)) FROM public.kasa_movements m WHERE m.kasa_day_id = d.id AND m.movement_type = 'ts_cost_cash_payment'), 0) AS ts_out
    FROM public.kasa_days d
    WHERE d.date_val = DATE '2026-08-31'
    LIMIT 1
),
cash_and_day_audit AS (
    SELECT 
        (
            SELECT opening_balance_kurus = 1007000
            FROM cash_components_audit
        ) AS opening_balance_unchanged,
        (
            SELECT public.fn_kasa_get_physical_cash(day_id)
            FROM cash_components_audit
        ) AS expected_physical_cash_kurus,
        (
            SELECT (
                opening_balance_kurus
                + capital_injected_kurus
                - owner_withdrawn_kurus
                + cash_sales
                + cash_credit
                + fx_try
                + ts_in
                + bank_to_cash
                - active_cash_exp
                - deposits
                - ts_out
            )
            FROM cash_components_audit
        ) AS formula_physical_cash_kurus,
        (
            (SELECT public.fn_kasa_get_physical_cash(day_id) FROM cash_components_audit) =
            (SELECT (
                opening_balance_kurus
                + capital_injected_kurus
                - owner_withdrawn_kurus
                + cash_sales
                + cash_credit
                + fx_try
                + ts_in
                + bank_to_cash
                - active_cash_exp
                - deposits
                - ts_out
            ) FROM cash_components_audit)
        ) AS physical_cash_matches_formula,
        (
            SELECT COUNT(*) 
            FROM public.kasa_expenses
            WHERE NOT (
                (payment_method = 'cash' AND bank_account_id IS NULL)
                OR (payment_method = 'bank' AND bank_account_id IS NOT NULL)
            )
        ) AS invalid_payment_matrix_count,
        (
            SELECT COUNT(*) 
            FROM public.kasa_expenses e
            LEFT JOIN public.kasa_bank_transactions t ON t.id = e.bank_transaction_id
            WHERE e.status = 'active' AND e.payment_method = 'bank'
              AND (t.id IS NULL OR t.related_expense_id <> e.id OR t.transaction_type <> 'bank_expense' OR t.direction <> 'out' OR t.status <> 'active')
        ) AS active_bank_expenses_without_active_out_tx,
        (
            SELECT COUNT(*) 
            FROM (
                SELECT idempotency_key 
                FROM public.kasa_expenses 
                WHERE idempotency_key IS NOT NULL 
                GROUP BY idempotency_key 
                HAVING COUNT(*) > 1
            ) dup_idem
        ) AS duplicate_idempotency_count
),
funcs_cat AS (
    SELECT 
        p.proname AS func_name,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        p.prosecdef AS is_security_definer,
        p.proconfig AS proconfig,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense', 'fn_kasa_get_physical_cash')
),
security_acl_audit AS (
    SELECT 
        -- Physical cash bank rules
        EXISTS (
            SELECT 1 FROM funcs_cat 
            WHERE func_name = 'fn_kasa_get_physical_cash'
              AND funcdef LIKE '%payment_method%'
              AND funcdef LIKE '%bank_to_cash%'
        ) AS physical_cash_bank_rules_present,
        -- Producer RPC and Consumer helper movement type contract alignment (independent checks)
        (
            EXISTS (
                SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_bank_transaction'
                  AND pg_get_functiondef(p.oid) LIKE '%bank_to_cash_withdrawal%'
                  AND pg_get_functiondef(p.oid) LIKE '%bank_to_cash%'
            )
            AND EXISTS (
                SELECT 1 FROM funcs_cat
                WHERE func_name = 'fn_kasa_get_physical_cash'
                  AND funcdef LIKE '%movement_type = ''bank_to_cash'''
            )
        ) AS bank_to_cash_movement_contract_ok,
        -- Safe search path
        (
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT (proconfig::text LIKE '%search_path=public, pg_temp%')) = 0
            AND (SELECT COUNT(*) FROM funcs_cat) = 4
        ) AS safe_search_path,
        -- Security definer
        (
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT is_security_definer) = 0
            AND (SELECT COUNT(*) FROM funcs_cat) = 4
        ) AS security_definer,
        -- Public execute revoked (Catalog aclexplode check, grantee = 0)
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense', 'fn_kasa_get_physical_cash')
              AND acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        ) = 0 AS public_execute_revoked,
        -- Anon execute revoked
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense', 'fn_kasa_get_physical_cash')
              AND r.rolname = 'anon'
              AND acl.privilege_type = 'EXECUTE'
        ) = 0 AS anon_execute_revoked,
        -- Authenticated execute revoked
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense', 'fn_kasa_get_physical_cash')
              AND r.rolname = 'authenticated'
              AND acl.privilege_type = 'EXECUTE'
        ) = 0 AS authenticated_execute_revoked,
        -- Service role execute allowed
        (
            SELECT COUNT(DISTINCT p.proname)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            JOIN pg_roles r ON r.oid = acl.grantee
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense', 'fn_kasa_get_physical_cash')
              AND r.rolname = 'service_role'
              AND acl.privilege_type = 'EXECUTE'
        ) = 4 AS service_role_execute_allowed
)
SELECT jsonb_build_object(
    'expense_payment_v8_postflight', jsonb_build_object(
        'postflight_executed_at', now(),
        'four_columns_ok', (SELECT four_columns_ok FROM cols_audit),
        'canonical_categories_ok', (SELECT canonical_categories_ok FROM categories_canonical_audit),
        'duplicate_categories_absent', (SELECT duplicate_categories_absent FROM categories_canonical_audit),
        'duplicate_display_orders_absent', (SELECT duplicate_display_orders_absent FROM categories_canonical_audit),
        'linked_expenses_remapped_ok', (SELECT linked_expenses_remapped_ok FROM categories_canonical_audit),
        'category_cross_remap_absent', (SELECT category_cross_remap_absent FROM categories_canonical_audit),
        'ambiguous_legacy_categories_count', (SELECT ambiguous_legacy_categories_count FROM categories_canonical_audit),
        'cam_silme_exact_target_count', (SELECT cam_silme_exact_target_count FROM cam_silme_audit),
        'cam_silme_payment_method', (SELECT cam_silme_payment_method FROM cam_silme_audit),
        'cam_silme_payment_method_cash_ok', (SELECT cam_silme_payment_method_cash_ok FROM cam_silme_audit),
        'cam_silme_bank_account_null_ok', (SELECT cam_silme_bank_account_null_ok FROM cam_silme_audit),
        'cam_silme_bank_transaction_null_ok', (SELECT cam_silme_bank_transaction_null_ok FROM cam_silme_audit),
        'cam_silme_any_related_bank_tx_count', (SELECT cam_silme_any_related_bank_tx_count FROM cam_silme_audit),
        'cam_silme_no_related_bank_tx_ok', (SELECT cam_silme_no_related_bank_tx_ok FROM cam_silme_audit),
        'cam_silme_category_ok', (SELECT cam_silme_category_ok FROM cam_silme_audit),
        'opening_balance_unchanged', (SELECT opening_balance_unchanged FROM cash_and_day_audit),
        'expected_physical_cash_kurus', (SELECT expected_physical_cash_kurus FROM cash_and_day_audit),
        'formula_physical_cash_kurus', (SELECT formula_physical_cash_kurus FROM cash_and_day_audit),
        'physical_cash_matches_formula', (SELECT physical_cash_matches_formula FROM cash_and_day_audit),
        'invalid_payment_matrix_count', (SELECT invalid_payment_matrix_count FROM cash_and_day_audit),
        'active_bank_expenses_without_active_out_tx', (SELECT active_bank_expenses_without_active_out_tx FROM cash_and_day_audit),
        'duplicate_idempotency_count', (SELECT duplicate_idempotency_count FROM cash_and_day_audit),
        'physical_cash_bank_rules_present', (SELECT physical_cash_bank_rules_present FROM security_acl_audit),
        'bank_to_cash_movement_contract_ok', (SELECT bank_to_cash_movement_contract_ok FROM security_acl_audit),
        'safe_search_path', (SELECT safe_search_path FROM security_acl_audit),
        'security_definer', (SELECT security_definer FROM security_acl_audit),
        'public_acl_catalog_ok', (
            (SELECT public_execute_revoked FROM security_acl_audit) = true AND
            (SELECT anon_execute_revoked FROM security_acl_audit) = true AND
            (SELECT authenticated_execute_revoked FROM security_acl_audit) = true AND
            (SELECT service_role_execute_allowed FROM security_acl_audit) = true
        ),
        'public_execute_revoked', (SELECT public_execute_revoked FROM security_acl_audit),
        'anon_execute_revoked', (SELECT anon_execute_revoked FROM security_acl_audit),
        'authenticated_execute_revoked', (SELECT authenticated_execute_revoked FROM security_acl_audit),
        'service_role_execute_allowed', (SELECT service_role_execute_allowed FROM security_acl_audit),
        'overall_ok', (
            (SELECT four_columns_ok FROM cols_audit) = true AND
            (SELECT canonical_categories_ok FROM categories_canonical_audit) = true AND
            (SELECT duplicate_categories_absent FROM categories_canonical_audit) = true AND
            (SELECT duplicate_display_orders_absent FROM categories_canonical_audit) = true AND
            (SELECT linked_expenses_remapped_ok FROM categories_canonical_audit) = true AND
            (SELECT category_cross_remap_absent FROM categories_canonical_audit) = true AND
            (SELECT ambiguous_legacy_categories_count FROM categories_canonical_audit) = 0 AND
            (SELECT cam_silme_exact_target_count FROM cam_silme_audit) = 1 AND
            (SELECT cam_silme_payment_method_cash_ok FROM cam_silme_audit) = true AND
            (SELECT cam_silme_bank_account_null_ok FROM cam_silme_audit) = true AND
            (SELECT cam_silme_bank_transaction_null_ok FROM cam_silme_audit) = true AND
            (SELECT cam_silme_no_related_bank_tx_ok FROM cam_silme_audit) = true AND
            (SELECT cam_silme_category_ok FROM cam_silme_audit) = true AND
            (SELECT opening_balance_unchanged FROM cash_and_day_audit) = true AND
            (SELECT physical_cash_matches_formula FROM cash_and_day_audit) = true AND
            (SELECT invalid_payment_matrix_count FROM cash_and_day_audit) = 0 AND
            (SELECT active_bank_expenses_without_active_out_tx FROM cash_and_day_audit) = 0 AND
            (SELECT duplicate_idempotency_count FROM cash_and_day_audit) = 0 AND
            (SELECT physical_cash_bank_rules_present FROM security_acl_audit) = true AND
            (SELECT bank_to_cash_movement_contract_ok FROM security_acl_audit) = true AND
            (SELECT safe_search_path FROM security_acl_audit) = true AND
            (SELECT security_definer FROM security_acl_audit) = true AND
            (SELECT public_execute_revoked FROM security_acl_audit) = true AND
            (SELECT anon_execute_revoked FROM security_acl_audit) = true AND
            (SELECT authenticated_execute_revoked FROM security_acl_audit) = true AND
            (SELECT service_role_execute_allowed FROM security_acl_audit) = true
        )
    )
) AS expense_payment_v8_postflight;
