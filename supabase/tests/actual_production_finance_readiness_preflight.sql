-- HurCELL actual production Finance MVP readiness preflight
-- Project ref: ufazfmosiywlskjlzach
-- Read-only: SELECT, CTE and PostgreSQL catalog inspection only.

WITH core_tables AS (
  SELECT (
    to_regclass('public.credit_customers') IS NOT NULL AND
    to_regclass('public.credit_accounts') IS NOT NULL AND
    to_regclass('public.credit_audit_logs') IS NOT NULL AND
    to_regclass('public.credit_transactions') IS NOT NULL
  ) AS present
),
finance_objects AS (
  SELECT (
    to_regclass('public.finance_plans') IS NULL AND
    to_regclass('public.finance_installments') IS NULL AND
    to_regclass('public.finance_collections') IS NULL AND
    to_regclass('public.finance_audit_logs') IS NULL AND
    to_regclass('public.finance_receipt_seq') IS NULL AND
    to_regprocedure('public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)') IS NULL AND
    to_regprocedure('public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)') IS NULL AND
    to_regprocedure('public.cancel_finance_plan(uuid,text,text)') IS NULL AND
    to_regprocedure('public.prevent_finance_append_only_update_delete()') IS NULL
  ) AS absent
),
numeric_types AS (
  SELECT
    (
      SELECT count(*) = 2
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'credit_transactions'
        AND column_name IN ('amount', 'balance_after')
        AND data_type = 'numeric'
    ) AS types_ok,
    (
      SELECT count(*) = 2
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'credit_transactions'
        AND column_name IN ('amount', 'balance_after')
        AND data_type = 'numeric'
        AND numeric_scale = 2
        AND numeric_precision IN (10, 12)
    ) AS precision_supported,
    NOT EXISTS (
      SELECT 1 FROM public.credit_transactions
      WHERE abs(amount) >= 10000000000 OR abs(balance_after) >= 10000000000
    ) AS values_fit_numeric_12_2,
    NOT EXISTS (
      SELECT 1 FROM public.credit_transactions
      WHERE (amount * 100) <> round(amount * 100)
         OR (balance_after * 100) <> round(balance_after * 100)
    ) AS values_have_max_two_decimals
),
duplicates AS (
  SELECT
    coalesce(sum(dup_count - 1), 0)::integer AS duplicates_count
  FROM (
    SELECT count(*) AS dup_count
    FROM public.credit_accounts
    GROUP BY credit_customer_id
    HAVING count(*) > 1
  ) dups
),
unique_index AS (
  SELECT (
    to_regclass('public.uniq_credit_accounts_credit_customer_id') IS NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index i
      WHERE i.indexrelid =
            to_regclass('public.uniq_credit_accounts_credit_customer_id')
        AND i.indrelid = 'public.credit_accounts'::regclass
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indislive
        AND i.indnatts = 1
        AND i.indnkeyatts = 1
        AND i.indexprs IS NULL
        AND i.indpred IS NULL
        AND i.indkey[0] = (
          SELECT a.attnum
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = 'public.credit_accounts'::regclass
            AND a.attname = 'credit_customer_id'
            AND a.attnum > 0
            AND NOT a.attisdropped
        )
    )
  ) AS absent_or_exact
),
source_constraint AS (
  SELECT
    (
      SELECT count(*) = 1
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid = to_regclass('public.credit_transactions')
        AND con.conname = 'chk_credit_transactions_source_type'
        AND con.contype = 'c'
    ) AS constraint_exists,
    coalesce((
      SELECT con.convalidated
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid = to_regclass('public.credit_transactions')
        AND con.conname = 'chk_credit_transactions_source_type'
        AND con.contype = 'c'
    ), false) AS constraint_validated,
    coalesce((
      SELECT regexp_replace(pg_get_constraintdef(con.oid, false), '\s+', ' ', 'g') IN (
        'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))',
        'CHECK (((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text]))))',
        'CHECK ((((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))))'
      )
      FROM pg_catalog.pg_constraint con
      WHERE con.conrelid = to_regclass('public.credit_transactions')
        AND con.conname = 'chk_credit_transactions_source_type'
        AND con.contype = 'c'
    ), false) AS constraint_old_definition_ok,
    (
      SELECT count(*)::integer FROM public.credit_transactions
      WHERE source_type NOT IN ('web_order', 'store_sale', 'service_fee', 'print_fee', 'technical_service_fee', 'payment', 'adjustment', 'reversal')
    ) AS unexpected_source_rows
),
rpc_oid AS (
  SELECT to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)') AS oid
),
ledger_rpc AS (
  SELECT
    (SELECT oid IS NOT NULL FROM rpc_oid) AS rpc_exists,
    coalesce((
      SELECT
        p.pronargs = 13
        AND pg_catalog.oidvectortypes(p.proargtypes) =
          'uuid, uuid, text, text, numeric, text, text, text, text, text, text, uuid, jsonb'
      FROM pg_catalog.pg_proc p
      JOIN rpc_oid r ON p.oid = r.oid
    ), false) AS rpc_signature_ok,
    coalesce((
      SELECT pg_get_function_result(oid) = 'jsonb'
      FROM rpc_oid
    ), false) AS rpc_returns_jsonb,
    coalesce((
      SELECT p.prosecdef
      FROM pg_proc p JOIN rpc_oid ON p.oid = rpc_oid.oid
    ), false) AS rpc_security_definer_ok,
    coalesce((
      SELECT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c
        WHERE replace(c, ' ', '') = 'search_path=public,pg_temp'
      )
      FROM pg_proc p JOIN rpc_oid ON p.oid = rpc_oid.oid
    ), false) AS rpc_search_path_ok,
    coalesce((
      SELECT md5(regexp_replace(btrim(p.prosrc), '\s+', ' ', 'g')) = 'b7620bc75905ac461f37ab32fc0b430e'
      FROM pg_proc p JOIN rpc_oid ON p.oid = rpc_oid.oid
    ), false) AS rpc_body_fingerprint_ok,
    coalesce((
      SELECT
        NOT has_function_privilege('public', oid, 'execute') AND
        NOT has_function_privilege('anon', oid, 'execute') AND
        NOT has_function_privilege('authenticated', oid, 'execute') AND
        has_function_privilege('service_role', oid, 'execute')
      FROM rpc_oid
    ), false) AS rpc_acl_ok
),
dependencies AS (
  SELECT
    (
      SELECT count(*)::integer FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.credit_transactions'::regclass
        AND attgenerated <> '' AND attnum > 0 AND NOT attisdropped
    ) AS generated_column_dependencies_count,
    (
      SELECT count(*)::integer FROM pg_catalog.pg_index
      WHERE indrelid = 'public.credit_transactions'::regclass
        AND indexprs IS NOT NULL
    ) AS expression_index_dependencies_count,
    (
      SELECT count(*)::integer FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_rewrite r ON r.oid = d.objid
      JOIN pg_catalog.pg_class v ON v.oid = r.ev_class
      WHERE d.refobjid = 'public.credit_transactions'::regclass
        AND d.refobjsubid IN (
          (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = d.refobjid AND attname = 'amount'),
          (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = d.refobjid AND attname = 'balance_after')
        )
        AND v.relkind IN ('v', 'm')
    ) AS view_dependencies_count
),
env_checks AS (
  SELECT
    (
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AND
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    ) AS required_roles_exist,
    (
      to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL OR
      to_regprocedure('public.gen_random_uuid()') IS NOT NULL
    ) AS gen_random_uuid_available
),
finance_conflicts AS (
  SELECT
    (
      SELECT count(*)::integer FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('finance_plans', 'finance_installments', 'finance_collections', 'finance_audit_logs')
    ) AS finance_conflicting_tables_count,
    (
      SELECT count(*)::integer FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'
        AND c.relname = 'finance_receipt_seq'
    ) AS finance_conflicting_sequences_count,
    (
      SELECT count(*)::integer FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('create_finance_plan', 'record_finance_collection', 'cancel_finance_plan', 'prevent_finance_append_only_update_delete')
    ) AS finance_conflicting_rpcs_count
),
locks_and_txs AS (
  SELECT
    (
      SELECT count(distinct pid)::integer FROM pg_catalog.pg_locks l
      JOIN pg_catalog.pg_class c ON c.oid = l.relation
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('credit_customers', 'credit_accounts', 'credit_audit_logs', 'credit_transactions')
        AND l.granted
        AND l.pid <> pg_backend_pid()
    ) AS blocking_lock_count,
    (
      SELECT count(*)::integer FROM pg_catalog.pg_stat_activity
      WHERE state IS DISTINCT FROM 'idle'
        AND (now() - xact_start) > interval '5 minutes'
        AND pid <> pg_backend_pid()
    ) AS long_running_transaction_count
)
SELECT
  ct.present AS core_credit_tables_exist,
  fo.absent AS finance_objects_absent,

  nt.types_ok AS ledger_numeric_types_ok,
  nt.precision_supported AS ledger_numeric_precision_supported,
  nt.values_fit_numeric_12_2 AS ledger_values_fit_numeric_12_2,
  nt.values_have_max_two_decimals AS ledger_values_have_max_two_decimals,

  d.duplicates_count AS credit_account_duplicates_count,
  (d.duplicates_count = 0) AS credit_account_duplicates_ok,

  ui.absent_or_exact AS credit_account_unique_index_absent_or_exact,
  sc.constraint_exists AS source_constraint_exists,
  sc.constraint_validated AS source_constraint_validated,
  sc.constraint_old_definition_ok AS source_constraint_old_definition_ok,
  sc.unexpected_source_rows AS unexpected_source_type_rows,

  lr.rpc_exists AS ledger_rpc_exists,
  lr.rpc_signature_ok AS ledger_rpc_signature_ok,
  lr.rpc_returns_jsonb AS ledger_rpc_returns_jsonb,
  lr.rpc_security_definer_ok AS ledger_rpc_security_definer_ok,
  lr.rpc_search_path_ok AS ledger_rpc_search_path_ok,
  lr.rpc_body_fingerprint_ok AS ledger_rpc_body_fingerprint_ok,
  lr.rpc_acl_ok AS ledger_rpc_acl_ok,

  dep.generated_column_dependencies_count AS generated_column_dependencies_count,
  dep.expression_index_dependencies_count AS expression_index_dependencies_count,
  dep.view_dependencies_count AS view_dependencies_count,
  (
    dep.generated_column_dependencies_count = 0 AND
    dep.expression_index_dependencies_count = 0 AND
    dep.view_dependencies_count = 0
  ) AS schema_dependencies_ok,

  env.required_roles_exist AS required_roles_exist,
  env.gen_random_uuid_available AS gen_random_uuid_available,

  fc.finance_conflicting_tables_count AS finance_conflicting_tables_count,
  fc.finance_conflicting_sequences_count AS finance_conflicting_sequences_count,
  fc.finance_conflicting_rpcs_count AS finance_conflicting_rpcs_count,

  (SELECT count(*) FROM public.credit_customers) AS credit_customers_count,
  (SELECT count(*) FROM public.credit_accounts) AS credit_accounts_count,
  (SELECT count(*) FROM public.credit_transactions) AS credit_transactions_count,
  coalesce((SELECT max(amount) FROM public.credit_transactions), 0) AS maximum_transaction_amount,
  coalesce((SELECT max(balance_after) FROM public.credit_transactions), 0) AS maximum_balance_after,

  lt.blocking_lock_count AS blocking_lock_count,
  lt.long_running_transaction_count AS long_running_transaction_count,

  (
    ct.present AND
    fo.absent AND
    nt.types_ok AND
    nt.precision_supported AND
    nt.values_fit_numeric_12_2 AND
    nt.values_have_max_two_decimals AND
    (d.duplicates_count = 0) AND
    ui.absent_or_exact AND
    sc.constraint_exists AND
    sc.constraint_validated AND
    sc.constraint_old_definition_ok AND
    (sc.unexpected_source_rows = 0) AND
    lr.rpc_exists AND
    lr.rpc_signature_ok AND
    lr.rpc_returns_jsonb AND
    lr.rpc_security_definer_ok AND
    lr.rpc_search_path_ok AND
    lr.rpc_body_fingerprint_ok AND
    lr.rpc_acl_ok AND
    (dep.generated_column_dependencies_count = 0) AND
    (dep.expression_index_dependencies_count = 0) AND
    (dep.view_dependencies_count = 0) AND
    env.required_roles_exist AND
    env.gen_random_uuid_available AND
    (fc.finance_conflicting_tables_count = 0) AND
    (fc.finance_conflicting_sequences_count = 0) AND
    (fc.finance_conflicting_rpcs_count = 0) AND
    (lt.blocking_lock_count = 0) AND
    (lt.long_running_transaction_count = 0)
  ) AS overall_ok
FROM core_tables ct
CROSS JOIN finance_objects fo
CROSS JOIN numeric_types nt
CROSS JOIN duplicates d
CROSS JOIN unique_index ui
CROSS JOIN source_constraint sc
CROSS JOIN ledger_rpc lr
CROSS JOIN dependencies dep
CROSS JOIN env_checks env
CROSS JOIN finance_conflicts fc
CROSS JOIN locks_and_txs lt;
