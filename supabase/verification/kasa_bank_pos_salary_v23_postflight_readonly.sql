-- ============================================================================
-- V23 Postflight Readonly Verification Script
-- Target DB: Linked Supabase (ufazfmosiywlskjlzach)
-- ============================================================================

SELECT json_build_object(
    'bank_accounts_count', (
        SELECT count(*) FROM public.kasa_bank_accounts WHERE is_active = true
    ),
    'bank_accounts', (
        SELECT json_agg(json_build_object(
            'id', id,
            'bank_name', bank_name,
            'account_name', account_name,
            'currency_code', currency_code,
            'current_balance_kurus', current_balance_kurus,
            'is_active', is_active
        ) ORDER BY display_order ASC)
        FROM public.kasa_bank_accounts
    ),
    'bahar_user_id', '38eca216-7235-414b-8cc3-349087a166da',
    'bahar_role', (
        SELECT role FROM public.kasa_users WHERE id = '38eca216-7235-414b-8cc3-349087a166da'
    ),
    'bahar_permissions', (
        SELECT json_agg(json_build_object(
            'permission_key', permission_key,
            'is_allowed', is_allowed
        ) ORDER BY permission_key ASC)
        FROM public.kasa_user_permissions
        WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
    ),
    'kasa_sales_has_pos_bank_col', (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'kasa_sales' AND column_name = 'pos_bank_account_id'
        )
    ),
    'daily_snapshots_table_exists', (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'kasa_bank_daily_snapshots'
        )
    ),
    'rpc_record_bank_daily_balance_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_record_bank_daily_balance'
        )
    ),
    'rpc_create_sale_33_args_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_sale'
              AND pg_get_function_identity_arguments(p.oid) LIKE '%p_pos_bank_account_id%'
        )
    ),
    'overall_ok', (
        SELECT (
            (SELECT count(*) FROM public.kasa_bank_accounts WHERE is_active = true) >= 6
            AND EXISTS (
                SELECT 1 FROM public.kasa_user_permissions
                WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
                  AND permission_key = 'kasa.bank.balance.record' AND is_allowed = true
            )
            AND EXISTS (
                SELECT 1 FROM public.kasa_user_permissions
                WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
                  AND permission_key = 'kasa.expense.salary.create' AND is_allowed = true
            )
            AND EXISTS (
                SELECT 1 FROM public.kasa_user_permissions
                WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
                  AND permission_key = 'kasa.expense.bank' AND is_allowed = true
            )
            AND EXISTS (
                SELECT 1 FROM public.kasa_user_permissions
                WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
                  AND permission_key = 'kasa.expense.view_all' AND is_allowed = true
            )
            AND EXISTS (
                SELECT 1 FROM public.kasa_user_permissions
                WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
                  AND permission_key = 'kasa.sale.cancel' AND is_allowed = true
            )
            AND EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'kasa_bank_daily_snapshots'
            )
        )
    )
) AS postflight_result;
