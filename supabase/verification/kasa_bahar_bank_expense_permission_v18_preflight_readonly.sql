-- ============================================================================
-- HurCELL Kasa V18 - Bahar Banka Gideri Yetkisi Öncesi Teşhis (Preflight Read-Only)
-- Hedef Kullanıcı: Bahar AYDAMGA (38eca216-7235-414b-8cc3-349087a166da / username: bahar)
--
-- KESİN GÜVENLİK KURALLARI:
--  1. Yalnız SELECT ve CTE; kesinlikle INSERT / UPDATE / DELETE / DDL İÇERMEZ.
--  2. Production verisini değiştirmez, test kaydı oluşturmaz.
--  3. Parola hash'i, secret, token veya private key bilgisi ASLA gösterilmez.
-- ============================================================================

WITH rpc_metadata AS (
    SELECT
        p.oid,
        p.proname,
        p.pronargs,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        pg_get_function_arguments(p.oid) AS full_args,
        p.prosecdef AS is_security_definer,
        p.proconfig AS search_path_config,
        p.proacl::text AS acl_permissions,
        has_function_privilege('public', p.oid, 'EXECUTE') AS has_execute_public,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS has_execute_anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS has_execute_authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS has_execute_service_role,
        pg_get_functiondef(p.oid) AS function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_create_expense'
),
target_user_info AS (
    SELECT
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at
    FROM public.kasa_users u
    WHERE u.id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
       OR u.username = 'bahar'
    LIMIT 1
),
target_user_perms AS (
    SELECT
        p.permission_key,
        p.created_at
    FROM public.kasa_user_permissions p
    WHERE p.user_id = (SELECT id FROM target_user_info)
    ORDER BY p.permission_key ASC
),
relevant_columns AS (
    SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
          'kasa_expenses',
          'kasa_bank_accounts',
          'bank_account_transactions',
          'kasa_audit_logs',
          'kasa_user_permissions',
          'kasa_idempotency_keys'
      )
    ORDER BY table_name, ordinal_position
),
relevant_constraints AS (
    SELECT
        c.relname AS table_name,
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'kasa_expenses',
          'kasa_bank_accounts',
          'bank_account_transactions',
          'kasa_audit_logs',
          'kasa_user_permissions',
          'kasa_idempotency_keys'
      )
    ORDER BY c.relname, con.conname
),
active_try_accounts AS (
    SELECT
        a.id,
        a.account_name,
        a.bank_name,
        a.account_number,
        a.iban,
        a.currency,
        a.is_active,
        a.balance_kurus
    FROM public.kasa_bank_accounts a
    WHERE a.currency = 'TRY'
      AND a.is_active IS TRUE
    ORDER BY a.account_name ASC
)
SELECT jsonb_pretty(jsonb_build_object(
    'preflight_timestamp', now(),
    'function_definitions', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'proname', r.proname,
                'identity_args', r.identity_args,
                'full_args', r.full_args,
                'is_security_definer', r.is_security_definer,
                'search_path_config', r.search_path_config,
                'proacl', r.acl_permissions,
                'has_execute_public', r.has_execute_public,
                'has_execute_anon', r.has_execute_anon,
                'has_execute_authenticated', r.has_execute_authenticated,
                'has_execute_service_role', r.has_execute_service_role,
                'function_definition', r.function_definition
            )
        )
        FROM rpc_metadata r
    ),
    'target_user', (
        SELECT jsonb_build_object(
            'found', (COUNT(*) > 0),
            'id', MAX(u.id::text),
            'username', MAX(u.username),
            'full_name', MAX(u.full_name),
            'role', MAX(u.role),
            'is_active', bool_and(u.is_active),
            'created_at', MAX(u.created_at),
            'all_permissions', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('permission_key', p.permission_key, 'created_at', p.created_at)), '[]'::jsonb)
                FROM target_user_perms p
            ),
            'has_bank_expense_permission', EXISTS (
                SELECT 1 FROM target_user_perms WHERE permission_key = 'kasa.expense.bank'
            )
        )
        FROM target_user_info u
    ),
    'active_try_accounts_summary', jsonb_build_object(
        'count', (SELECT COUNT(*) FROM active_try_accounts),
        'accounts', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', a.id,
                    'account_name', a.account_name,
                    'bank_name', a.bank_name,
                    'account_number', a.account_number,
                    'iban', a.iban,
                    'currency', a.currency,
                    'is_active', a.is_active,
                    'balance_kurus', a.balance_kurus
                )
            ), '[]'::jsonb)
            FROM active_try_accounts a
        )
    ),
    'table_columns', (
        SELECT jsonb_object_agg(
            tbl.table_name,
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'column_name', col.column_name,
                        'data_type', col.data_type,
                        'is_nullable', col.is_nullable,
                        'column_default', col.column_default
                    )
                )
                FROM relevant_columns col
                WHERE col.table_name = tbl.table_name
            )
        )
        FROM (
            SELECT DISTINCT table_name FROM relevant_columns
        ) tbl
    ),
    'table_constraints', (
        SELECT jsonb_object_agg(
            tbl.table_name,
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'constraint_name', con.constraint_name,
                        'constraint_type', con.constraint_type,
                        'constraint_definition', con.constraint_definition
                    )
                )
                FROM relevant_constraints con
                WHERE con.table_name = tbl.table_name
            )
        )
        FROM (
            SELECT DISTINCT table_name FROM relevant_constraints
        ) tbl
    )
)) AS preflight_diagnostic_report;
