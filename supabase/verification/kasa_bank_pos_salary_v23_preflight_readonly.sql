-- V23 Preflight Readonly Inspection
-- Target DB: Linked Supabase (ufazfmosiywlskjlzach)

SELECT json_build_object(
    'existing_bank_accounts', (
        SELECT COALESCE(json_agg(json_build_object(
            'id', id,
            'bank_name', bank_name,
            'account_name', account_name,
            'currency_code', currency_code,
            'current_balance_kurus', current_balance_kurus,
            'is_active', is_active
        ) ORDER BY bank_name), '[]'::json)
        FROM public.kasa_bank_accounts
    ),
    'kasa_sales_has_pos_bank_account_id', (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'kasa_sales' AND column_name = 'pos_bank_account_id'
        )
    ),
    'kasa_bank_transactions_columns', (
        SELECT json_agg(column_name ORDER BY ordinal_position)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kasa_bank_transactions'
    ),
    'kasa_bank_transactions_check_constraints', (
        SELECT json_agg(json_build_object('constraint_name', conname, 'definition', pg_get_constraintdef(oid)))
        FROM pg_constraint
        WHERE conrelid = 'public.kasa_bank_transactions'::regclass
    ),
    'bahar_permissions', (
        SELECT COALESCE(json_agg(json_build_object('permission_key', permission_key, 'is_allowed', is_allowed) ORDER BY permission_key), '[]'::json)
        FROM public.kasa_user_permissions
        WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
    ),
    'hur_role', (
        SELECT role FROM public.kasa_users WHERE id = '1fdbe071-8975-4af2-88fd-a339eb71b2e6'
    ),
    'bahar_role', (
        SELECT role FROM public.kasa_users WHERE id = '38eca216-7235-414b-8cc3-349087a166da'
    ),
    'salary_expense_categories', (
        SELECT COALESCE(json_agg(json_build_object('id', id, 'name', name, 'is_active', is_active)), '[]'::json)
        FROM public.kasa_expense_categories
        WHERE name ILIKE '%maaş%' OR name ILIKE '%personel%'
    ),
    'daily_snapshots_table_exists', (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name IN ('kasa_bank_daily_snapshots', 'kasa_bank_daily_balances')
        )
    )
) AS preflight_result;
