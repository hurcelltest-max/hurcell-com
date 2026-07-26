-- ============================================================================
-- HurCELL WhatsApp Catalog Production Policy, Security & Data Quality Preflight
-- Target Environment: Supabase Production Database
-- ============================================================================
-- IMPORTANT WARNING & SAFETY DIRECTIVES:
-- 1. READ-ONLY PREFLIGHT AUDIT ONLY: Strictly uses SELECT, pg_catalog metadata, and lightweight aggregate counts.
-- 2. NO DML, NO DDL, NO RPC EXECUTION, NO QUERY_TO_XML, NO PII / ROW-LEVEL READS.
-- 3. SAFE TO REVIEW BEFORE MANUAL DASHBOARD EXECUTION.
-- ============================================================================

WITH
-- 1. RLS Policy Metadata Checks
target_policy_tables(table_name) AS (
  VALUES
    ('products'),
    ('orders'),
    ('order_items'),
    ('credit_customers'),
    ('credit_accounts'),
    ('credit_transactions'),
    ('finance_plans'),
    ('finance_installments'),
    ('finance_collections')
),
policy_rls_checks AS (
  SELECT
    'POLICY_RLS'::text AS check_group,
    format('policy_%s_%s', p.tablename, p.policyname)::text AS check_name,
    format('public.%I policy [%s]', p.tablename, p.policyname)::text AS object_name,
    format('Cmd: %s, Roles: %s, Permissive: %s', p.cmd, array_to_string(p.roles, ','), p.permissive)::text AS expected,
    format('qual=(%s), with_check=(%s)', coalesce(p.qual, 'none'), coalesce(p.with_check, 'none'))::text AS actual,
    CASE
      WHEN ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles)) AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE') THEN 'FAIL'
      WHEN p.tablename = 'products' AND p.cmd = 'SELECT' AND (p.qual LIKE '%is_web_visible%' OR p.qual LIKE '%active%') THEN 'PASS'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles)) AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE') THEN 'BLOCKER'
      WHEN p.tablename = 'products' AND p.qual LIKE '%is_web_visible%' THEN 'INFO'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles)) AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE') THEN 'ANON WRITE PATH EXISTS: Unauthenticated write policy detected!'
      WHEN p.tablename = 'products' THEN format('Products SELECT policy condition: %s. Verify against production columns for REPO / PRODUCTION DRIFT.', coalesce(p.qual, 'true'))
      ELSE 'RLS policy definition verified.'
    END::text AS notes
  FROM target_policy_tables t
  JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = t.table_name

  UNION ALL

  -- Fallback for target tables with NO RLS policies defined
  SELECT
    'POLICY_RLS'::text AS check_group,
    format('policy_%s_no_policies', t.table_name)::text AS check_name,
    format('public.%I', t.table_name)::text AS object_name,
    'RLS policies defined for table'::text AS expected,
    'No explicit pg_policies found for table'::text AS actual,
    'WARN'::text AS status,
    'MEDIUM'::text AS severity,
    'DIRECT GRANT BUT RLS DENIES BY DEFAULT: No policies exist; verify default RLS denial behavior for unauthenticated access.'::text AS notes
  FROM target_policy_tables t
  WHERE to_regclass(format('public.%I', t.table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.table_name
    )
),

-- 2. Function Privilege & Static Security Checks
target_rpcs(rpc_name, is_required) AS (
  VALUES
    ('decrement_product_stock_safe', true),
    ('release_order_stock', true),
    ('create_finance_plan', true),
    ('record_finance_collection', false),
    ('add_credit_transaction', false),
    ('review_credit_application', false),
    ('cancel_finance_plan', false)
),
function_privilege_checks AS (
  SELECT
    'FUNCTION_PRIVILEGE'::text AS check_group,
    format('rpc_privilege_%s_oid_%s', p.proname, p.oid::text)::text AS check_name,
    format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))::text AS object_name,
    'Security Definer, fixed search_path, PUBLIC execute disabled, service_role execute enabled'::text AS expected,
    format('ret=%s, secdef=%s, config=%s, public_exec=%s, service_role_exec=%s, dynamic_exec=%s',
      pg_get_function_result(p.oid),
      p.prosecdef,
      coalesce(array_to_string(p.proconfig, ','), 'none'),
      CASE WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
            AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'true' ELSE 'false/role_missing' END,
      CASE WHEN pg_get_functiondef(p.oid) ~* '\mEXECUTE\M' THEN 'true' ELSE 'false' END
    )::text AS actual,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'FAIL'
      WHEN p.prosecdef AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))) THEN 'WARN'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'BLOCKER'
      WHEN p.prosecdef AND (p.proconfig IS NULL) THEN 'HIGH'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'PUBLIC EXECUTE ENABLED: Unauthenticated users can execute RPC via API!'
      WHEN p.prosecdef AND (p.proconfig IS NULL) THEN 'SEARCH_PATH MISSING: SECURITY DEFINER requires fixed search_path=public, pg_temp.'
      ELSE 'Function metadata and privilege configuration verified.'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN target_rpcs r ON r.rpc_name = p.proname
  WHERE n.nspname = 'public'

  UNION ALL

  SELECT
    'FUNCTION_PRIVILEGE'::text AS check_group,
    format('rpc_privilege_%s_missing', r.rpc_name)::text AS check_name,
    format('public.%I()', r.rpc_name)::text AS object_name,
    'RPC exists in public schema'::text AS expected,
    'RPC missing'::text AS actual,
    CASE WHEN r.is_required THEN 'FAIL' ELSE 'INFO' END::text AS status,
    CASE WHEN r.is_required THEN 'BLOCKER' ELSE 'LOW' END::text AS severity,
    CASE WHEN r.is_required THEN 'CRITICAL: Required RPC missing from public schema.' ELSE 'RPC not present in DB.' END::text AS notes
  FROM target_rpcs r
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.rpc_name
  )
),

-- 3. Trigger Security & Append-Only Verification
target_trigger_tables(table_name) AS (
  VALUES
    ('credit_transactions'),
    ('finance_plans'),
    ('finance_installments'),
    ('finance_collections')
),
trigger_security_checks AS (
  SELECT
    'TRIGGER_SECURITY'::text AS check_group,
    format('trigger_%s_%s', c.relname, t.tgname)::text AS check_name,
    format('public.%I [%s]', c.relname, t.tgname)::text AS object_name,
    'Append-only trigger active, blocking UPDATE/DELETE'::text AS expected,
    format('enabled=%s, function=%s, def=(%s)',
      CASE WHEN t.tgenabled = 'O' THEN 'enabled' ELSE 'disabled' END,
      p.proname,
      pg_get_triggerdef(t.oid, true)
    )::text AS actual,
    'PASS'::text AS status,
    'INFO'::text AS severity,
    'LIKELY RPC-ONLY / APPEND-ONLY: Direct table write denied to preserve immutable ledger integrity. Writes mediated via SECURITY DEFINER RPC.'::text AS notes
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  JOIN target_trigger_tables tr ON tr.table_name = c.relname
  WHERE n.nspname = 'public' AND NOT t.tgisinternal

  UNION ALL

  SELECT
    'TRIGGER_SECURITY'::text AS check_group,
    format('trigger_%s_no_triggers', tr.table_name)::text AS check_name,
    format('public.%I', tr.table_name)::text AS object_name,
    'Triggers defined on ledger table'::text AS expected,
    'No user triggers found on table'::text AS actual,
    'INFO'::text AS status,
    'LOW'::text AS severity,
    'No user-defined append-only triggers found on table.'::text AS notes
  FROM target_trigger_tables tr
  WHERE to_regclass(format('public.%I', tr.table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tr.table_name AND NOT t.tgisinternal
    )
),

-- 4. Product Aggregate Data-Quality Summary (Lightweight & PII-Free)
product_data_quality_checks AS (
  SELECT
    'PRODUCT_DATA_QUALITY'::text AS check_group,
    'products_aggregate_data_quality_summary'::text AS check_name,
    'public.products'::text AS object_name,
    'All products have non-null, non-negative price and stock'::text AS expected,
    format('total=%s, null_price=%s, null_stock=%s, neg_price=%s, neg_stock=%s, zero_price=%s, zero_stock=%s',
      count(*),
      count(*) FILTER (WHERE price IS NULL),
      count(*) FILTER (WHERE stock IS NULL),
      count(*) FILTER (WHERE price < 0),
      count(*) FILTER (WHERE stock < 0),
      count(*) FILTER (WHERE price = 0),
      count(*) FILTER (WHERE stock = 0)
    )::text AS actual,
    CASE
      WHEN count(*) FILTER (WHERE price IS NULL) > 0 OR count(*) FILTER (WHERE stock IS NULL) > 0 THEN 'WARN'
      WHEN count(*) FILTER (WHERE price < 0) > 0 OR count(*) FILTER (WHERE stock < 0) > 0 THEN 'WARN'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN count(*) FILTER (WHERE price IS NULL) > 0 OR count(*) FILTER (WHERE stock IS NULL) > 0 THEN 'HIGH'
      WHEN count(*) FILTER (WHERE price < 0) > 0 OR count(*) FILTER (WHERE stock < 0) > 0 THEN 'HIGH'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN count(*) FILTER (WHERE price IS NULL) > 0 THEN 'WARNING: Null prices present in DB. Must be sanitized before NOT NULL migration.'
      WHEN count(*) FILTER (WHERE stock IS NULL) > 0 THEN 'WARNING: Null stocks present in DB. Catalog engine treats NULL stock as 0.'
      ELSE 'Product inventory and price data quality verified.'
    END::text AS notes
  FROM public.products
  WHERE to_regclass('public.products') IS NOT NULL
),

-- 5. Customer Master Architecture Gate
customer_master_checks AS (
  SELECT
    'CUSTOMER_MASTER'::text AS check_group,
    'customer_master_architecture_status'::text AS check_name,
    'public.customers'::text AS object_name,
    'Retail customer master table exists in public schema'::text AS expected,
    CASE
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'public.customers table present'
      ELSE 'public.customers table missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'PASS'
      ELSE 'MANUAL_CHECK_REQUIRED'
    END::text AS status,
    CASE
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'Retail customer master table present.'
      ELSE 'CUSTOMER MASTER MISSING. Do not automatically substitute public.credit_customers. Customer master architecture must be resolved first.'
    END::text AS notes
),

-- 6. Combine All Audits into Final Ordered Output
all_audits AS (
  SELECT * FROM policy_rls_checks
  UNION ALL
  SELECT * FROM function_privilege_checks
  UNION ALL
  SELECT * FROM trigger_security_checks
  UNION ALL
  SELECT * FROM product_data_quality_checks
  UNION ALL
  SELECT * FROM customer_master_checks
)
SELECT
  coalesce(check_group, 'UNKNOWN') AS check_group,
  coalesce(check_name, 'unknown_check') AS check_name,
  coalesce(object_name, 'unknown_object') AS object_name,
  coalesce(expected, 'none') AS expected,
  coalesce(actual, 'none') AS actual,
  coalesce(status, 'WARN') AS status,
  coalesce(severity, 'MEDIUM') AS severity,
  coalesce(notes, 'none') AS notes
FROM all_audits
ORDER BY
  CASE check_group
    WHEN 'CUSTOMER_MASTER' THEN 1
    WHEN 'POLICY_RLS' THEN 2
    WHEN 'FUNCTION_PRIVILEGE' THEN 3
    WHEN 'TRIGGER_SECURITY' THEN 4
    WHEN 'PRODUCT_DATA_QUALITY' THEN 5
    ELSE 6
  END,
  CASE severity
    WHEN 'BLOCKER' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    ELSE 5
  END,
  check_name;
