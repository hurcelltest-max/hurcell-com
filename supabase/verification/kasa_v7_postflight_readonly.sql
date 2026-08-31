-- ============================================================================
-- HURCELL KASA V7 PRODUCTION POSTFLIGHT READ-ONLY AUDIT QUERY
-- ============================================================================
-- KONUM: supabase/verification/kasa_v7_postflight_readonly.sql
-- %100 SALT OKUNUR (READ-ONLY) SORGUDUR. VERİTABANINDA HİÇBİR YAZMA YAPMAZ.
-- ============================================================================

WITH req_tables AS (
    SELECT unnest(ARRAY[
        'kasa_sales',
        'kasa_expenses',
        'kasa_days',
        'kasa_movements',
        'kasa_bank_accounts',
        'kasa_bank_transactions',
        'kasa_bank_settings',
        'kasa_idempotency_keys',
        'kasa_audit_logs',
        'kasa_users'
    ]) AS table_name
),
tables_audit AS (
    SELECT
        r.table_name,
        (t.table_name IS NOT NULL) AS is_present
    FROM req_tables r
    LEFT JOIN information_schema.tables t ON t.table_schema = 'public' AND t.table_name = r.table_name
),
bank_tables_security AS (
    SELECT
        -- RLS enabled on all 4 new bank & idempotency tables
        BOOL_AND(c.relrowsecurity) AS bank_tables_rls_enabled,
        -- Public, anon, and authenticated table privileges revoked
        (
            SELECT COUNT(*)
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public'
              AND table_name IN ('kasa_bank_accounts', 'kasa_bank_transactions', 'kasa_bank_settings', 'kasa_idempotency_keys')
              AND grantee IN ('PUBLIC')
        ) = 0 AS public_table_privileges_revoked,
        (
            SELECT COUNT(*)
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public'
              AND table_name IN ('kasa_bank_accounts', 'kasa_bank_transactions', 'kasa_bank_settings', 'kasa_idempotency_keys')
              AND grantee IN ('anon')
        ) = 0 AS anon_table_privileges_revoked,
        (
            SELECT COUNT(*)
            FROM information_schema.role_table_grants
            WHERE table_schema = 'public'
              AND table_name IN ('kasa_bank_accounts', 'kasa_bank_transactions', 'kasa_bank_settings', 'kasa_idempotency_keys')
              AND grantee IN ('authenticated')
        ) = 0 AS authenticated_table_privileges_revoked
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('kasa_bank_accounts', 'kasa_bank_transactions', 'kasa_bank_settings', 'kasa_idempotency_keys')
),
funcs_cat AS (
    SELECT
        p.proname AS func_name,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        pg_get_function_result(p.oid) AS result_type,
        p.prosecdef AS is_security_definer,
        p.proconfig AS proconfig,
        p.proacl AS proacl,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale', 'fn_kasa_validate_service_cost_status')
),
rpc_security_audit AS (
    SELECT
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale', 'fn_kasa_create_bank_transaction', 'fn_kasa_settle_pos_to_bank', 'fn_kasa_withdraw_owner_capital_from_bank', 'fn_kasa_configure_pos_settings')
              AND EXISTS (
                  SELECT 1
                  FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                  WHERE acl.grantee = 0
                    AND acl.privilege_type = 'EXECUTE'
              )
        ) = 0 AS public_rpc_execute_revoked,
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale', 'fn_kasa_create_bank_transaction', 'fn_kasa_settle_pos_to_bank', 'fn_kasa_withdraw_owner_capital_from_bank', 'fn_kasa_configure_pos_settings')
              AND array_to_string(p.proacl, ',') LIKE '%anon=X%'
        ) = 0 AS anon_rpc_execute_revoked,
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale', 'fn_kasa_create_bank_transaction', 'fn_kasa_settle_pos_to_bank', 'fn_kasa_withdraw_owner_capital_from_bank', 'fn_kasa_configure_pos_settings')
              AND array_to_string(p.proacl, ',') LIKE '%authenticated=X%'
        ) = 0 AS authenticated_rpc_execute_revoked,
        (
            SELECT COUNT(*)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale', 'fn_kasa_create_bank_transaction', 'fn_kasa_settle_pos_to_bank', 'fn_kasa_withdraw_owner_capital_from_bank', 'fn_kasa_configure_pos_settings')
              AND array_to_string(p.proacl, ',') LIKE '%service_role=X%'
        ) = 7 AS service_role_rpc_execute_allowed
),
trigger_audit AS (
    SELECT
        COUNT(*) AS real_trigger_count,
        BOOL_AND(t.tgenabled = 'O') AS trigger_active,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%YENİ_SATIŞ_LEGACY_STATÜ_YASAK%'
        ) AS has_legacy_insert_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%Legacy Teknik Servis maliyet bilgisi değiştirilemez%'
        ) AS has_legacy_update_cost_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%LEGACY_STATÜ_DEĞİŞTİRİLEMEZ%'
        ) AS has_legacy_update_source_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%TEKNİK_SERVİS_DURUM_KAYNAK_UYUMSUZ%'
        ) AS has_legacy_update_bank_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%kasa_categories%'
        ) AS has_legacy_update_category_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_validate_service_cost_status'
              AND funcdef LIKE '%GEÇERSİZ_BANKA_PARA_BİRİMİ%'
        ) AS has_bank_active_try_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_create_sale'
              AND funcdef LIKE '%BANKA_ÖDEMESİ_YETKİSİZ%'
        ) AS has_create_rpc_manager_bank_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_update_sale'
              AND funcdef LIKE '%BANKA_ÖDEMESİ_YETKİSİZ%'
        ) AS has_update_rpc_manager_bank_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_cancel_sale'
              AND funcdef LIKE '%GEÇERSİZ_KULLANICI%'
        ) AS has_cancel_rpc_actor_validation_guard,
        EXISTS (
            SELECT 1 FROM funcs_cat
            WHERE func_name = 'fn_kasa_cancel_sale'
              AND funcdef LIKE '%Satış iptali yetkisi yalnızca yöneticilere aittir%'
        ) AS has_cancel_rpc_manager_guard
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'trg_kasa_validate_service_cost_status'
      AND NOT t.tgisinternal
),
cols_and_constraints_audit AS (
    SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kasa_sales' AND column_name='service_cost_payment_source') AS has_source_col,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kasa_sales' AND column_name='service_cost_bank_account_id') AS has_bank_account_col,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kasa_sales_service_cost_payment_source') AS has_source_constraint,
        EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname = 'chk_kasa_sales_service_cost_payment_source'
              AND pg_get_constraintdef(c.oid) LIKE '%cash%'
              AND pg_get_constraintdef(c.oid) LIKE '%bank%'
              AND pg_get_constraintdef(c.oid) LIKE '%stock%'
              AND pg_get_constraintdef(c.oid) LIKE '%previously_paid%'
              AND pg_get_constraintdef(c.oid) LIKE '%none%'
        ) AS source_constraint_values_ok,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kasa_sales_service_cost_payment_status') AS has_status_constraint,
        EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname = 'chk_kasa_sales_service_cost_payment_status'
              AND pg_get_constraintdef(c.oid) LIKE '%paid_from_cash%'
              AND pg_get_constraintdef(c.oid) LIKE '%paid_from_bank%'
              AND pg_get_constraintdef(c.oid) LIKE '%used_from_stock%'
              AND pg_get_constraintdef(c.oid) LIKE '%previously_paid%'
              AND pg_get_constraintdef(c.oid) LIKE '%unpaid%'
              AND pg_get_constraintdef(c.oid) LIKE '%no_cost%'
              AND pg_get_constraintdef(c.oid) LIKE '%previously_paid_or_stock%'
              AND pg_get_constraintdef(c.oid) LIKE '%legacy_unspecified%'
        ) AS status_constraint_values_ok,
        EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname = 'chk_kasa_movements_type'
              AND pg_get_constraintdef(c.oid) LIKE '%satis%'
              AND pg_get_constraintdef(c.oid) LIKE '%nakit_tahsilat%'
              AND pg_get_constraintdef(c.oid) LIKE '%kredi_karti_tahsilat%'
              AND pg_get_constraintdef(c.oid) LIKE '%bank_transfer_tahsilat%'
              AND pg_get_constraintdef(c.oid) LIKE '%nakit_gider%'
              AND pg_get_constraintdef(c.oid) LIKE '%iade%'
              AND pg_get_constraintdef(c.oid) LIKE '%iptal%'
              AND pg_get_constraintdef(c.oid) LIKE '%acilis_bakiyesi%'
              AND pg_get_constraintdef(c.oid) LIKE '%gun_sonu_kapanis%'
              AND pg_get_constraintdef(c.oid) LIKE '%capital_injection%'
              AND pg_get_constraintdef(c.oid) LIKE '%owner_withdrawal%'
              AND pg_get_constraintdef(c.oid) LIKE '%cash_carry_forward%'
              AND pg_get_constraintdef(c.oid) LIKE '%salary_payment%'
              AND pg_get_constraintdef(c.oid) LIKE '%technical_service_revenue%'
              AND pg_get_constraintdef(c.oid) LIKE '%technical_service_expense%'
              AND pg_get_constraintdef(c.oid) LIKE '%inventory_purchase%'
              AND pg_get_constraintdef(c.oid) LIKE '%bank_deposit%'
              AND pg_get_constraintdef(c.oid) LIKE '%fx_sale_payment%'
              AND pg_get_constraintdef(c.oid) LIKE '%fx_capital_injection%'
              AND pg_get_constraintdef(c.oid) LIKE '%fx_conversion_to_try%'
              AND pg_get_constraintdef(c.oid) LIKE '%fx_bank_deposit%'
              AND pg_get_constraintdef(c.oid) LIKE '%fx_return%'
              AND pg_get_constraintdef(c.oid) LIKE '%credit_tahsilat%'
              AND pg_get_constraintdef(c.oid) LIKE '%satis_duzeltme_iptal%'
              AND pg_get_constraintdef(c.oid) LIKE '%satis_duzeltme_yeni%'
              AND pg_get_constraintdef(c.oid) LIKE '%gider_duzeltme_iptal%'
              AND pg_get_constraintdef(c.oid) LIKE '%gider_duzeltme_yeni%'
              AND pg_get_constraintdef(c.oid) LIKE '%gider_iptal%'
              AND pg_get_constraintdef(c.oid) LIKE '%ts_cost_cash_payment%'
              AND pg_get_constraintdef(c.oid) LIKE '%ts_cost_cash_refund%'
              AND pg_get_constraintdef(c.oid) LIKE '%carryover_repair%'
              AND pg_get_constraintdef(c.oid) LIKE '%bank_to_cash%'
        ) AS movement_types_ok
),
sales_accounting_audit AS (
    SELECT
        -- NULL-safe status ve source uyuşmazlığı kontrolü (MUST BE 0)
        COUNT(*) FILTER (
            WHERE (service_cost_payment_status = 'paid_from_cash' AND service_cost_payment_source IS DISTINCT FROM 'cash')
               OR (service_cost_payment_status = 'paid_from_bank' AND service_cost_payment_source IS DISTINCT FROM 'bank')
               OR (service_cost_payment_status = 'used_from_stock' AND service_cost_payment_source IS DISTINCT FROM 'stock')
               OR (service_cost_payment_status = 'previously_paid' AND service_cost_payment_source IS DISTINCT FROM 'previously_paid')
               OR (service_cost_payment_status = 'no_cost' AND service_cost_payment_source IS DISTINCT FROM 'none')
               OR (service_cost_payment_status = 'unpaid' AND service_cost_payment_source IS NOT NULL)
        ) AS status_source_mismatch_count,
        -- Birleşik statülü ama source'u non-null yapılmış kayıt sayısı (MUST BE 0)
        COUNT(*) FILTER (WHERE service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified') AND service_cost_payment_source IS NOT NULL) AS combined_status_nonnull_source_count,
        -- Birleşik statülü ama banka hesabı atanmış kayıt sayısı (MUST BE 0)
        COUNT(*) FILTER (WHERE service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified') AND service_cost_bank_account_id IS NOT NULL) AS combined_status_bank_account_count,
        -- Bankadan ödenip hesabı boş kalan kayıt sayısı (MUST BE 0)
        COUNT(*) FILTER (WHERE service_cost_payment_status = 'paid_from_bank' AND service_cost_bank_account_id IS NULL) AS paid_from_bank_without_account_count,
        -- Bankadan ödenip pasif/geçersiz hesaba bağlı kayıt sayısı (NOT EXISTS kullanımı) (MUST BE 0)
        COUNT(*) FILTER (
            WHERE service_cost_payment_status = 'paid_from_bank'
              AND NOT EXISTS (
                  SELECT 1 FROM public.kasa_bank_accounts b
                  WHERE b.id = kasa_sales.service_cost_bank_account_id
                    AND b.is_active = true
                    AND b.currency_code = 'TRY'
              )
        ) AS paid_from_bank_invalid_account_count,
        -- Teknik Servis harici satırda (veya category_id NULL) kaynak atanmış kayıt sayısı (NOT EXISTS kullanımı) (MUST BE 0)
        COUNT(*) FILTER (
            WHERE service_cost_payment_source IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.kasa_categories cat
                  WHERE cat.id = kasa_sales.category_id
                    AND cat.name = 'Teknik Servis'
              )
        ) AS non_service_rows_with_service_source_count,
        -- Geçersiz no_cost kaydı (maliyeti 0 olmayan) (MUST BE 0)
        COUNT(*) FILTER (WHERE service_cost_payment_status = 'no_cost' AND COALESCE(service_cost_kurus, 0) <> 0) AS invalid_no_cost_count,
        -- Geçersiz unpaid kaydı (maliyeti <= 0 olan) (MUST BE 0)
        COUNT(*) FILTER (WHERE service_cost_payment_status = 'unpaid' AND COALESCE(service_cost_kurus, 0) <= 0) AS invalid_unpaid_count,
        -- Aynen korunan legacy kayıt sayısı (Mevcut 29 kayıt)
        COUNT(*) FILTER (WHERE service_cost_payment_status IN ('previously_paid_or_stock', 'legacy_unspecified')) AS legacy_rows_preserved_count
    FROM public.kasa_sales
),
rpc_duplicate_audit AS (
    SELECT COUNT(*) AS duplicate_rpc_signature_count
    FROM (
        SELECT proname, COUNT(*) AS cnt
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale', 'fn_kasa_cancel_sale')
        GROUP BY proname
        HAVING COUNT(*) > 1
    ) dup
)
SELECT jsonb_build_object(
    'kasa_v7_postflight', jsonb_build_object(
        'postflight_executed_at', now(),
        'bank_tables_rls_enabled', (SELECT bank_tables_rls_enabled FROM bank_tables_security),
        'public_table_privileges_revoked', (SELECT public_table_privileges_revoked FROM bank_tables_security),
        'anon_table_privileges_revoked', (SELECT anon_table_privileges_revoked FROM bank_tables_security),
        'authenticated_table_privileges_revoked', (SELECT authenticated_table_privileges_revoked FROM bank_tables_security),
        'public_rpc_execute_revoked', (SELECT public_rpc_execute_revoked FROM rpc_security_audit),
        'anon_rpc_execute_revoked', (SELECT anon_rpc_execute_revoked FROM rpc_security_audit),
        'authenticated_rpc_execute_revoked', (SELECT authenticated_rpc_execute_revoked FROM rpc_security_audit),
        'service_role_rpc_execute_allowed', (SELECT service_role_rpc_execute_allowed FROM rpc_security_audit),
        'source_constraint_exists', (SELECT has_source_constraint FROM cols_and_constraints_audit),
        'source_constraint_values_ok', (SELECT source_constraint_values_ok FROM cols_and_constraints_audit),
        'status_constraint_exists', (SELECT has_status_constraint FROM cols_and_constraints_audit),
        'status_constraint_values_ok', (SELECT status_constraint_values_ok FROM cols_and_constraints_audit),
        'trigger_exists', ((SELECT real_trigger_count FROM trigger_audit) = 1),
        'trigger_active', COALESCE((SELECT trigger_active FROM trigger_audit), false),
        'safe_search_path', (
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT (proconfig::text LIKE '%search_path=public, pg_temp%')) = 0
        ),
        'security_definer', (
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT is_security_definer) = 0
        ),
        'legacy_insert_guard_present', (SELECT has_legacy_insert_guard FROM trigger_audit),
        'legacy_update_cost_guard_present', (SELECT has_legacy_update_cost_guard FROM trigger_audit),
        'legacy_update_source_guard_present', (SELECT has_legacy_update_source_guard FROM trigger_audit),
        'legacy_update_bank_guard_present', (SELECT has_legacy_update_bank_guard FROM trigger_audit),
        'legacy_update_category_guard_present', (SELECT has_legacy_update_category_guard FROM trigger_audit),
        'create_rpc_manager_bank_guard_present', (SELECT has_create_rpc_manager_bank_guard FROM trigger_audit),
        'update_rpc_manager_bank_guard_present', (SELECT has_update_rpc_manager_bank_guard FROM trigger_audit),
        'cancel_rpc_actor_validation_present', (SELECT has_cancel_rpc_actor_validation_guard FROM trigger_audit),
        'cancel_rpc_manager_guard_present', (SELECT has_cancel_rpc_manager_guard FROM trigger_audit),
        'bank_account_active_try_guard_present', (SELECT has_bank_active_try_guard FROM trigger_audit),
        'status_source_mismatch_count', (SELECT status_source_mismatch_count FROM sales_accounting_audit),
        'combined_status_nonnull_source_count', (SELECT combined_status_nonnull_source_count FROM sales_accounting_audit),
        'combined_status_bank_account_count', (SELECT combined_status_bank_account_count FROM sales_accounting_audit),
        'paid_from_bank_without_account_count', (SELECT paid_from_bank_without_account_count FROM sales_accounting_audit),
        'paid_from_bank_invalid_account_count', (SELECT paid_from_bank_invalid_account_count FROM sales_accounting_audit),
        'non_service_rows_with_service_source_count', (SELECT non_service_rows_with_service_source_count FROM sales_accounting_audit),
        'invalid_no_cost_count', (SELECT invalid_no_cost_count FROM sales_accounting_audit),
        'invalid_unpaid_count', (SELECT invalid_unpaid_count FROM sales_accounting_audit),
        'legacy_rows_preserved_count', (SELECT legacy_rows_preserved_count FROM sales_accounting_audit),
        'legacy_rows_preserved_ok', ((SELECT legacy_rows_preserved_count FROM sales_accounting_audit) = 29),
        'duplicate_rpc_signature_count', (SELECT duplicate_rpc_signature_count FROM rpc_duplicate_audit),
        'movement_types_ok', (SELECT movement_types_ok FROM cols_and_constraints_audit),
        'overall_ok', (
            (SELECT COUNT(*) FROM funcs_cat WHERE func_name = 'fn_kasa_create_sale') = 1 AND
            (SELECT COUNT(*) FROM funcs_cat WHERE func_name = 'fn_kasa_update_sale') = 1 AND
            (SELECT COUNT(*) FROM funcs_cat WHERE func_name = 'fn_kasa_cancel_sale') = 1 AND
            (SELECT real_trigger_count FROM trigger_audit) = 1 AND
            COALESCE((SELECT trigger_active FROM trigger_audit), false) = true AND
            (SELECT has_source_col FROM cols_and_constraints_audit) = true AND
            (SELECT has_source_constraint FROM cols_and_constraints_audit) = true AND
            (SELECT source_constraint_values_ok FROM cols_and_constraints_audit) = true AND
            (SELECT has_status_constraint FROM cols_and_constraints_audit) = true AND
            (SELECT status_constraint_values_ok FROM cols_and_constraints_audit) = true AND
            (SELECT movement_types_ok FROM cols_and_constraints_audit) = true AND
            (SELECT has_legacy_insert_guard FROM trigger_audit) = true AND
            (SELECT has_legacy_update_cost_guard FROM trigger_audit) = true AND
            (SELECT has_legacy_update_source_guard FROM trigger_audit) = true AND
            (SELECT has_legacy_update_bank_guard FROM trigger_audit) = true AND
            (SELECT has_legacy_update_category_guard FROM trigger_audit) = true AND
            (SELECT has_create_rpc_manager_bank_guard FROM trigger_audit) = true AND
            (SELECT has_update_rpc_manager_bank_guard FROM trigger_audit) = true AND
            (SELECT has_cancel_rpc_actor_validation_guard FROM trigger_audit) = true AND
            (SELECT has_cancel_rpc_manager_guard FROM trigger_audit) = true AND
            (SELECT has_bank_active_try_guard FROM trigger_audit) = true AND
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT is_security_definer) = 0 AND
            (SELECT COUNT(*) FROM funcs_cat WHERE NOT (proconfig::text LIKE '%search_path=public, pg_temp%')) = 0 AND
            (SELECT bank_tables_rls_enabled FROM bank_tables_security) = true AND
            (SELECT public_table_privileges_revoked FROM bank_tables_security) = true AND
            (SELECT anon_table_privileges_revoked FROM bank_tables_security) = true AND
            (SELECT authenticated_table_privileges_revoked FROM bank_tables_security) = true AND
            (SELECT public_rpc_execute_revoked FROM rpc_security_audit) = true AND
            (SELECT anon_rpc_execute_revoked FROM rpc_security_audit) = true AND
            (SELECT authenticated_rpc_execute_revoked FROM rpc_security_audit) = true AND
            (SELECT service_role_rpc_execute_allowed FROM rpc_security_audit) = true AND
            (SELECT status_source_mismatch_count FROM sales_accounting_audit) = 0 AND
            (SELECT combined_status_nonnull_source_count FROM sales_accounting_audit) = 0 AND
            (SELECT combined_status_bank_account_count FROM sales_accounting_audit) = 0 AND
            (SELECT paid_from_bank_without_account_count FROM sales_accounting_audit) = 0 AND
            (SELECT paid_from_bank_invalid_account_count FROM sales_accounting_audit) = 0 AND
            (SELECT non_service_rows_with_service_source_count FROM sales_accounting_audit) = 0 AND
            (SELECT invalid_no_cost_count FROM sales_accounting_audit) = 0 AND
            (SELECT invalid_unpaid_count FROM sales_accounting_audit) = 0 AND
            (SELECT legacy_rows_preserved_count FROM sales_accounting_audit) = 29 AND
            (SELECT duplicate_rpc_signature_count FROM rpc_duplicate_audit) = 0
        )
    )
) AS postflight_result;
