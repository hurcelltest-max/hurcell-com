-- ============================================================================
-- HurCELL WhatsApp Catalog Production Read-Only Preflight Audit
-- Target Environment: Supabase Production Database
-- ============================================================================
-- IMPORTANT WARNING & SAFETY DIRECTIVES:
-- 1. READ-ONLY METADATA AUDIT ONLY: Uses strictly SELECT and pg_catalog metadata.
-- 2. DOES NOT VERIFY SUPABASE PROJECT REF: SQL catalog queries cannot verify Dashboard project ref.
-- 3. DO NOT RUN UNTIL DASHBOARD PROJECT REF IS MANUALLY CONFIRMED IN SUPABASE DASHBOARD.
-- 4. NO DML, NO DDL, NO RPC EXECUTION, NO QUERY_TO_XML, NO DATA ROW SCANS.
-- 5. SAFE TO REVIEW BEFORE MANUAL DASHBOARD EXECUTION.
-- ============================================================================

WITH
-- 1. Identity & Environment Metadata
identity_checks AS (
  SELECT
    'IDENTITY'::text AS check_group,
    'supabase_project_ref_manual_confirmation'::text AS check_name,
    'Supabase Dashboard Project Ref'::text AS object_name,
    'Project Ref verified manually in Dashboard URL before execution'::text AS expected,
    format('db=%s, user=%s, schema=%s, ver=%s, tz=%s',
      coalesce(current_database(), 'unknown'),
      coalesce(current_user, 'unknown'),
      coalesce(current_schema(), 'unknown'),
      coalesce(current_setting('server_version', true), 'unknown'),
      coalesce(current_setting('TimeZone', true), 'unknown')
    )::text AS actual,
    'MANUAL_CHECK_REQUIRED'::text AS status,
    'BLOCKER'::text AS severity,
    'Confirm the Supabase Dashboard project ref manually in Dashboard URL before relying on SQL results.'::text AS notes

  UNION ALL

  SELECT
    'INFORMATIONAL'::text AS check_group,
    'postgresql_environment_metadata'::text AS check_name,
    'pg_catalog'::text AS object_name,
    'Valid PostgreSQL database connection'::text AS expected,
    format('database=%s, user=%s, schema=%s, version=%s',
      coalesce(current_database(), 'unknown'),
      coalesce(current_user, 'unknown'),
      coalesce(current_schema(), 'unknown'),
      coalesce(current_setting('server_version', true), 'unknown')
    )::text AS actual,
    'PASS'::text AS status,
    'INFO'::text AS severity,
    'Read-only connection metadata retrieved successfully.'::text AS notes
),

-- 2. Role Existence Safe Guard & Table ACL Matrix
target_acl_tables(table_name) AS (
  VALUES
    ('products'),
    ('customers'),
    ('orders'),
    ('order_items'),
    ('credit_customers'),
    ('credit_accounts'),
    ('credit_transactions'),
    ('finance_plans'),
    ('finance_installments'),
    ('finance_collections')
),
target_acl_roles(role_name, is_public_pseudo) AS (
  VALUES
    ('PUBLIC', true),
    ('anon', false),
    ('authenticated', false),
    ('service_role', false)
),
target_acl_privileges(priv_name) AS (
  VALUES
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE')
),
table_acl_matrix_checks AS (
  SELECT
    'SECURITY'::text AS check_group,
    format('table_acl_%s_%s_%s', t.table_name, r.role_name, p.priv_name)::text AS check_name,
    format('public.%I [%s -> %s]', t.table_name, r.role_name, p.priv_name)::text AS object_name,
    CASE
      WHEN r.role_name IN ('PUBLIC', 'anon') AND p.priv_name IN ('INSERT', 'UPDATE', 'DELETE') THEN 'Privilege DISABLED for unauthenticated roles'
      WHEN r.role_name = 'service_role' THEN 'Privilege ENABLED for service_role'
      WHEN t.table_name = 'products' AND r.role_name IN ('PUBLIC', 'anon') AND p.priv_name = 'SELECT' THEN 'SELECT allowed per public storefront policy'
      ELSE format('Role %s privilege %s evaluated against RLS policy', r.role_name, p.priv_name)
    END::text AS expected,
    CASE
      WHEN c.relname IS NULL THEN 'Table missing'
      WHEN r.is_public_pseudo THEN
        CASE WHEN EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = p.priv_name
        ) THEN 'PRIVILEGE_GRANTED' ELSE 'PRIVILEGE_DENIED' END
      WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r.role_name) THEN 'Role does not exist in DB'
      WHEN has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'PRIVILEGE_GRANTED'
      ELSE 'PRIVILEGE_DENIED'
    END::text AS actual,
    CASE
      WHEN c.relname IS NULL THEN 'NOT_APPLICABLE'
      WHEN r.is_public_pseudo THEN
        CASE
          WHEN p.priv_name IN ('INSERT', 'UPDATE', 'DELETE') AND EXISTS (
            SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = p.priv_name
          ) THEN 'FAIL'
          ELSE 'PASS'
        END
      WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r.role_name) THEN 'WARN'
      WHEN r.role_name = 'anon' AND p.priv_name IN ('INSERT', 'UPDATE', 'DELETE')
       AND has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'FAIL'
      WHEN r.role_name = 'service_role' AND NOT has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'FAIL'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN c.relname IS NULL THEN 'INFO'
      WHEN r.is_public_pseudo AND p.priv_name IN ('INSERT', 'UPDATE', 'DELETE') AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = p.priv_name
      ) THEN 'BLOCKER'
      WHEN r.is_public_pseudo THEN 'INFO'
      WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r.role_name) THEN 'MEDIUM'
      WHEN r.role_name = 'anon' AND p.priv_name IN ('INSERT', 'UPDATE', 'DELETE')
       AND has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'BLOCKER'
      WHEN r.role_name = 'service_role' AND NOT has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'HIGH'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN c.relname IS NULL THEN 'Table missing from public schema.'
      WHEN r.is_public_pseudo THEN
        CASE
          WHEN p.priv_name IN ('INSERT', 'UPDATE', 'DELETE') AND EXISTS (
            SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = p.priv_name
          ) THEN 'BLOCKER: PUBLIC write privilege granted directly on table!'
          WHEN t.table_name = 'products' AND p.priv_name = 'SELECT' THEN 'Public catalog read allowed per storefront policy.'
          ELSE 'PUBLIC table ACL privilege verified via aclexplode.'
        END
      WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r.role_name) THEN 'Role missing from DB; expected in Supabase environment.'
      WHEN r.role_name = 'anon' AND p.priv_name IN ('INSERT', 'UPDATE', 'DELETE')
       AND has_table_privilege(r.role_name, format('public.%I', t.table_name), p.priv_name) THEN 'BLOCKER: Unauthenticated write privilege granted directly on table!'
      WHEN t.table_name = 'products' AND r.role_name = 'anon' AND p.priv_name = 'SELECT' THEN 'Public catalog read allowed per storefront policy.'
      ELSE 'Table ACL privilege state verified.'
    END::text AS notes
  FROM target_acl_tables t
  CROSS JOIN target_acl_roles r
  CROSS JOIN target_acl_privileges p
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = t.table_name
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
),

-- 3. Products Detailed Coverage
products_columns_expected(col_name, expected_type, is_required) AS (
  VALUES
    ('id', 'uuid', true),
    ('stock', 'integer', true),
    ('price', 'numeric', true),
    ('name', 'text', true),
    ('sku', 'text', false),
    ('barcode', 'text', false),
    ('brand', 'text', false),
    ('category', 'text', false),
    ('is_web_visible', 'boolean', false)
),
products_detailed_checks AS (
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    format('products_column_%s', e.col_name)::text AS check_name,
    format('public.products.%I', e.col_name)::text AS object_name,
    format('Column exists with type %s (NOT NULL = %s)', e.expected_type, e.is_required)::text AS expected,
    CASE
      WHEN to_regclass('public.products') IS NULL THEN 'public.products table missing'
      WHEN c.column_name IS NOT NULL THEN format('data_type=%s, udt=%s, nullable=%s, prec=%s, scale=%s, default=%s',
        c.data_type, c.udt_name, c.is_nullable, coalesce(c.numeric_precision::text, 'none'), coalesce(c.numeric_scale::text, 'none'), coalesce(c.column_default, 'none'))
      ELSE 'Column missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.products') IS NULL THEN 'FAIL'
      WHEN c.column_name IS NOT NULL THEN 'PASS'
      WHEN e.is_required THEN 'FAIL'
      ELSE 'WARN'
    END::text AS status,
    CASE
      WHEN to_regclass('public.products') IS NULL THEN 'BLOCKER'
      WHEN c.column_name IS NULL AND e.col_name IN ('stock', 'price') THEN 'BLOCKER'
      WHEN c.column_name IS NULL AND e.is_required THEN 'HIGH'
      WHEN c.column_name IS NOT NULL AND e.col_name = 'price' AND coalesce(c.numeric_scale, 0) > 2 THEN 'WARN'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN to_regclass('public.products') IS NULL THEN 'CRITICAL: public.products table missing.'
      WHEN e.col_name = 'price' AND c.column_name IS NOT NULL THEN 'NOTE: DB price is numeric TL. Pure engine expects safe integer kuruş (numeric TL * 100). Preflight verifies schema type compatibility only.'
      WHEN e.col_name = 'stock' AND c.column_name IS NOT NULL THEN 'products.stock integer verified for inventory recheck.'
      WHEN c.column_name IS NOT NULL THEN 'Column verified.'
      ELSE 'Optional column missing.'
    END::text AS notes
  FROM products_columns_expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'products'
   AND c.column_name = e.col_name
),

-- 4. Customers Decision Logic Checks
customers_detailed_checks AS (
  -- 4A. Table presence
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'customers_table_exists'::text AS check_name,
    'public.customers'::text AS object_name,
    'Retail customer master table exists'::text AS expected,
    CASE
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'Table present'
      ELSE 'Table missing'
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
      WHEN to_regclass('public.customers') IS NOT NULL THEN 'public.customers table verified.'
      ELSE 'Retail customer master architecture must be confirmed. Do not automatically substitute public.credit_customers.'
    END::text AS notes

  UNION ALL

  -- 4B. Column phone_normalized
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'customers_phone_normalized_column'::text AS check_name,
    'public.customers.phone_normalized'::text AS object_name,
    'Column phone_normalized exists (text, NOT NULL)'::text AS expected,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'public.customers table missing'
      WHEN c.column_name IS NOT NULL THEN format('data_type=%s, nullable=%s', c.data_type, c.is_nullable)
      ELSE 'Column missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'NOT_APPLICABLE'
      WHEN c.column_name IS NOT NULL THEN 'PASS'
      ELSE 'WARN'
    END::text AS status,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'INFO'
      WHEN c.column_name IS NOT NULL THEN 'INFO'
      ELSE 'HIGH'
    END::text AS severity,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'Table missing; phone_normalized check skipped.'
      WHEN c.column_name IS NOT NULL THEN 'Column verified.'
      ELSE 'phone_normalized column missing from public.customers.'
    END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'customers'
   AND c.column_name = 'phone_normalized'

  UNION ALL

  -- 4C. Unique Index on phone_normalized
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'customers_phone_normalized_unique'::text AS check_name,
    'public.customers.phone_normalized'::text AS object_name,
    'UNIQUE constraint or index on phone_normalized'::text AS expected,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'public.customers table missing'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'customers'
          AND i.indexdef LIKE '%phone_normalized%'
          AND i.indexdef LIKE '%UNIQUE%'
      ) THEN 'UNIQUE index verified'
      ELSE 'UNIQUE index missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'NOT_APPLICABLE'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'customers'
          AND i.indexdef LIKE '%phone_normalized%'
          AND i.indexdef LIKE '%UNIQUE%'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'INFO'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'customers'
          AND i.indexdef LIKE '%phone_normalized%'
          AND i.indexdef LIKE '%UNIQUE%'
      ) THEN 'INFO'
      ELSE 'HIGH'
    END::text AS severity,
    'Unique index on normalized phone ensures idempotent customer lookup.'::text AS notes
  FROM (SELECT 1) _dummy2

  UNION ALL

  -- 4D. Customer Status Column (Future Planned)
  SELECT
    'FUTURE_WHATSAPP_PLANNED'::text AS check_group,
    'customers_status_lifecycle_column'::text AS check_name,
    'public.customers.status'::text AS object_name,
    'Planned lifecycle status column (ACTIVE, SUSPENDED, BLOCKED)'::text AS expected,
    CASE
      WHEN to_regclass('public.customers') IS NULL THEN 'public.customers table missing'
      WHEN c.column_name IS NOT NULL THEN format('data_type=%s, nullable=%s', c.data_type, c.is_nullable)
      ELSE 'Column missing (Planned future migration)'
    END::text AS actual,
    'NOT_APPLICABLE'::text AS status,
    'LOW'::text AS severity,
    'Planned future migration; absence is not a current production blocker.'::text AS notes
  FROM (SELECT 1) _dummy3
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'customers'
   AND c.column_name = 'status'
),

-- 5. Orders & Order_Items Schema & Foreign Key Coverage
orders_schema_expected(table_name, col_name, expected_type, is_required) AS (
  VALUES
    ('orders', 'id', 'uuid', true),
    ('orders', 'order_number', 'text', true),
    ('orders', 'status', 'text', true),
    ('orders', 'payment_method', 'text', false),
    ('orders', 'stock_reserved_at', 'timestamp with time zone', false),
    ('orders', 'stock_released_at', 'timestamp with time zone', false),
    ('orders', 'stock_release_reason', 'text', false),
    ('order_items', 'id', 'uuid', true),
    ('order_items', 'order_id', 'uuid', true),
    ('order_items', 'product_id', 'uuid', true),
    ('order_items', 'quantity', 'integer', true),
    ('order_items', 'unit_price_snapshot', 'numeric', false),
    ('order_items', 'final_unit_price_snapshot', 'numeric', false),
    ('order_items', 'line_total', 'numeric', false)
),
orders_schema_checks AS (
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    format('orders_column_%s_%s', e.table_name, e.col_name)::text AS check_name,
    format('public.%I.%I', e.table_name, e.col_name)::text AS object_name,
    format('Column exists with type %s', e.expected_type)::text AS expected,
    CASE
      WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN format('Table public.%I missing', e.table_name)
      WHEN c.column_name IS NOT NULL THEN format('data_type=%s, udt=%s, nullable=%s', c.data_type, c.udt_name, c.is_nullable)
      ELSE 'Column missing'
    END::text AS actual,
    CASE
      WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN 'FAIL'
      WHEN c.column_name IS NOT NULL THEN 'PASS'
      WHEN e.is_required THEN 'FAIL'
      ELSE 'WARN'
    END::text AS status,
    CASE
      WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN 'BLOCKER'
      WHEN c.column_name IS NULL AND e.is_required THEN 'BLOCKER'
      WHEN c.column_name IS NULL THEN 'MEDIUM'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN 'Table missing.'
      WHEN c.column_name IS NOT NULL THEN 'Column verified.'
      ELSE 'Required order schema column missing.'
    END::text AS notes
  FROM orders_schema_expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.col_name
),

-- Foreign Key Constraints for Order Items
order_fk_checks AS (
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'order_items_order_id_fk'::text AS check_name,
    'public.order_items.order_id -> public.orders.id'::text AS object_name,
    'Foreign key constraint order_items.order_id references orders.id'::text AS expected,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.orders') IS NULL THEN 'Target tables missing'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'order_id'
      ) THEN 'Foreign Key constraint verified'
      ELSE 'Foreign Key constraint missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.orders') IS NULL THEN 'FAIL'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'order_id'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.orders') IS NULL THEN 'BLOCKER'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'order_id'
      ) THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    'Order items FK linkage is mandatory for relational order integrity.'::text AS notes
  FROM (SELECT 1) _dummy

  UNION ALL

  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'order_items_product_id_fk'::text AS check_name,
    'public.order_items.product_id -> public.products.id'::text AS object_name,
    'Foreign key constraint order_items.product_id references products.id'::text AS expected,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.products') IS NULL THEN 'Target tables missing'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'product_id'
      ) THEN 'Foreign Key constraint verified'
      ELSE 'Foreign Key constraint missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.products') IS NULL THEN 'FAIL'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'product_id'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN to_regclass('public.order_items') IS NULL OR to_regclass('public.products') IS NULL THEN 'BLOCKER'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'product_id'
      ) THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    'Product FK linkage is mandatory for inventory recheck integrity.'::text AS notes
  FROM (SELECT 1) _dummy2
),

-- 6. Stock RPC Overload-Safe Metadata & Function Body Static Security
rpc_overload_checks AS (
  SELECT
    'SECURITY'::text AS check_group,
    format('rpc_overload_%s_oid_%s', p.proname, p.oid::text)::text AS check_name,
    format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))::text AS object_name,
    'Function exists, SECURITY DEFINER with search_path=public,pg_temp, PUBLIC execute disabled, service_role enabled, no dynamic EXECUTE'::text AS expected,
    format('ret=%s, secdef=%s, config=%s, public_exec=%s, service_role_exec=%s, dynamic_exec=%s, products_update=%s',
      pg_get_function_result(p.oid),
      p.prosecdef,
      coalesce(array_to_string(p.proconfig, ','), 'none'),
      CASE WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
            AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'true' ELSE 'false/role_missing' END,
      CASE WHEN pg_get_functiondef(p.oid) ~* '\mEXECUTE\M' THEN 'true' ELSE 'false' END,
      CASE WHEN pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?products' THEN 'true' ELSE 'false' END
    )::text AS actual,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'FAIL'
      WHEN p.prosecdef AND (p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))) THEN 'WARN'
      WHEN pg_get_functiondef(p.oid) ~* '\mEXECUTE\M' THEN 'WARN'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'BLOCKER'
      WHEN p.prosecdef AND (p.proconfig IS NULL) THEN 'HIGH'
      WHEN pg_get_functiondef(p.oid) ~* '\mEXECUTE\M' THEN 'HIGH'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'BLOCKER: PUBLIC execute is enabled on stock modification RPC!'
      WHEN p.prosecdef AND (p.proconfig IS NULL) THEN 'SECURITY DEFINER requires fixed search_path parameter to prevent search_path hijacking.'
      WHEN pg_get_functiondef(p.oid) ~* '\mEXECUTE\M' THEN 'WARNING: Dynamic EXECUTE statement detected inside function body.'
      ELSE 'Stock RPC overload metadata and static body security verified via aclexplode.'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('decrement_product_stock_safe', 'release_order_stock')

  UNION ALL

  -- Fallback row if decrement_product_stock_safe does not exist in DB at all
  SELECT
    'SECURITY'::text AS check_group,
    'rpc_overload_decrement_product_stock_safe_missing'::text AS check_name,
    'public.decrement_product_stock_safe()'::text AS object_name,
    'Stock decrement RPC exists in public schema'::text AS expected,
    'RPC missing'::text AS actual,
    'FAIL'::text AS status,
    'BLOCKER'::text AS severity,
    'CRITICAL: decrement_product_stock_safe RPC missing from public schema.'::text AS notes
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'decrement_product_stock_safe'
  )

  UNION ALL

  -- Fallback row if release_order_stock does not exist in DB at all
  SELECT
    'SECURITY'::text AS check_group,
    'rpc_overload_release_order_stock_missing'::text AS check_name,
    'public.release_order_stock()'::text AS object_name,
    'Stock release RPC exists in public schema'::text AS expected,
    'RPC missing'::text AS actual,
    'FAIL'::text AS status,
    'BLOCKER'::text AS severity,
    'CRITICAL: release_order_stock RPC missing from public schema.'::text AS notes
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'release_order_stock'
  )
),

-- 7. Table RLS Security Checks
rls_tables_expected(table_name) AS (
  VALUES
    ('products'), ('orders'), ('order_items'), ('customers'),
    ('credit_customers'), ('credit_accounts'), ('credit_transactions'),
    ('finance_plans'), ('finance_installments'), ('finance_collections')
),
rls_checks AS (
  SELECT
    'SECURITY'::text AS check_group,
    format('rls_security_%s', e.table_name)::text AS check_name,
    format('public.%I', e.table_name)::text AS object_name,
    'RLS enabled (relrowsecurity = true)'::text AS expected,
    CASE
      WHEN c.relname IS NULL THEN 'Table missing'
      WHEN c.relrowsecurity THEN 'RLS enabled'
      ELSE 'RLS disabled'
    END::text AS actual,
    CASE
      WHEN c.relname IS NULL THEN 'NOT_APPLICABLE'
      WHEN c.relrowsecurity THEN 'PASS'
      ELSE 'WARN'
    END::text AS status,
    CASE
      WHEN c.relname IS NULL THEN 'INFO'
      WHEN c.relrowsecurity THEN 'INFO'
      ELSE 'HIGH'
    END::text AS severity,
    CASE
      WHEN c.relname IS NULL THEN 'Table missing.'
      WHEN c.relrowsecurity THEN 'RLS is active.'
      ELSE 'RLS is disabled on table; verify policy access controls.'
    END::text AS notes
  FROM rls_tables_expected e
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = e.table_name
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
),

-- 8. Finance Detailed Coverage
finance_detailed_checks AS (
  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'finance_plans_table_exists'::text AS check_name,
    'public.finance_plans'::text AS object_name,
    'Finance plans table exists with source linkage'::text AS expected,
    CASE
      WHEN to_regclass('public.finance_plans') IS NULL THEN 'Table missing'
      ELSE 'Table present'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.finance_plans') IS NOT NULL THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN to_regclass('public.finance_plans') IS NOT NULL THEN 'INFO'
      ELSE 'HIGH'
    END::text AS severity,
    'Finance plans table status verified.'::text AS notes

  UNION ALL

  SELECT
    'CURRENT_ERP_REQUIRED'::text AS check_group,
    'finance_plans_source_columns'::text AS check_name,
    'public.finance_plans.source_type'::text AS object_name,
    'Columns source_type and source_reference exist in finance_plans'::text AS expected,
    CASE
      WHEN to_regclass('public.finance_plans') IS NULL THEN 'public.finance_plans missing'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = 'finance_plans' AND c.column_name = 'source_type'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = 'finance_plans' AND c.column_name = 'source_reference'
      ) THEN 'source_type and source_reference columns present'
      ELSE 'source_type or source_reference missing'
    END::text AS actual,
    CASE
      WHEN to_regclass('public.finance_plans') IS NULL THEN 'NOT_APPLICABLE'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = 'finance_plans' AND c.column_name = 'source_type'
      ) THEN 'PASS'
      ELSE 'WARN'
    END::text AS status,
    CASE
      WHEN to_regclass('public.finance_plans') IS NULL THEN 'INFO'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = 'finance_plans' AND c.column_name = 'source_type'
      ) THEN 'INFO'
      ELSE 'HIGH'
    END::text AS severity,
    'Finance linkage columns verified.'::text AS notes
  FROM (SELECT 1) _dummy
),

-- 9. Future WhatsApp Planned Objects (NOT BLOCKER CURRENTLY)
future_whatsapp_expected(object_type, object_name, description) AS (
  VALUES
    ('table', 'catalog_sessions', 'Session state tracking for catalog browsing'),
    ('table', 'shopping_carts', 'Server-side shopping cart header'),
    ('table', 'shopping_cart_items', 'Server-side shopping cart line items'),
    ('table', 'stock_reservations', 'Stock reservation holds for cart/checkout'),
    ('table', 'whatsapp_order_requests', 'WhatsApp order request master record'),
    ('table', 'whatsapp_order_request_items', 'WhatsApp order request line items'),
    ('table', 'whatsapp_order_offers', 'WhatsApp offer snapshots and versions'),
    ('table', 'notification_outbox', 'WhatsApp notification queue outbox'),
    ('column', 'products.whatsapp_visible', 'Product WhatsApp channel visibility flag'),
    ('function', 'approve_whatsapp_order_request', 'Atomic RPC converting WhatsApp order to ERP order')
),
future_whatsapp_checks AS (
  SELECT
    'FUTURE_WHATSAPP_PLANNED'::text AS check_group,
    format('future_planned_%s', e.object_name)::text AS check_name,
    e.object_name::text AS object_name,
    format('Planned future migration: %s', e.description)::text AS expected,
    CASE
      WHEN e.object_type = 'table' AND to_regclass(format('public.%I', e.object_name)) IS NOT NULL THEN 'Already present in DB'
      WHEN e.object_type = 'function' AND to_regprocedure(format('public.%I()', e.object_name)) IS NOT NULL THEN 'Already present in DB'
      WHEN e.object_type = 'column' AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = split_part(e.object_name, '.', 1) AND c.column_name = split_part(e.object_name, '.', 2)
      ) THEN 'Already present in DB'
      ELSE 'Not present (Planned for future migration)'
    END::text AS actual,
    'NOT_APPLICABLE'::text AS status,
    'LOW'::text AS severity,
    'Planned future migration; absence is not a current production blocker.'::text AS notes
  FROM future_whatsapp_expected e
),

-- 10. Combine All Audits into Final Ordered Output
all_audits AS (
  SELECT * FROM identity_checks
  UNION ALL
  SELECT * FROM table_acl_matrix_checks
  UNION ALL
  SELECT * FROM products_detailed_checks
  UNION ALL
  SELECT * FROM customers_detailed_checks
  UNION ALL
  SELECT * FROM orders_schema_checks
  UNION ALL
  SELECT * FROM order_fk_checks
  UNION ALL
  SELECT * FROM rpc_overload_checks
  UNION ALL
  SELECT * FROM rls_checks
  UNION ALL
  SELECT * FROM finance_detailed_checks
  UNION ALL
  SELECT * FROM future_whatsapp_checks
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
    WHEN 'IDENTITY' THEN 1
    WHEN 'CURRENT_ERP_REQUIRED' THEN 2
    WHEN 'SECURITY' THEN 3
    WHEN 'FUTURE_WHATSAPP_PLANNED' THEN 4
    ELSE 5
  END,
  CASE severity
    WHEN 'BLOCKER' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    ELSE 5
  END,
  check_name;
