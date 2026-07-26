-- ============================================================================
-- Postflight Verification Script: General Customer Master (Paket B Fail-Fast Hardened)
-- Target: Supabase Database (Run AFTER applying Paket B Migration)
-- ============================================================================
-- IMPORTANT WARNING & SAFETY DIRECTIVES:
-- 1. READ-ONLY METADATA AUDIT ONLY: Strictly uses SELECT and pg_catalog metadata.
-- 2. NO PII DATA READS, NO CUSTOMER INSERTIONS, NO DML/DDL.
-- 3. SAFE TO EXECUTE TO VERIFY PAKET B MIGRATION POSTURE.
-- ============================================================================

WITH all_results AS (
  -- 1. Verify public.customers table existence & RLS status
  SELECT
    'TABLE_POSTFLIGHT'::text AS check_group,
    'customers_table_existence_and_rls'::text AS check_name,
    'public.customers table'::text AS object_name,
    'Table exists and relrowsecurity = true (RLS enabled)'::text AS expected,
    CASE
      WHEN c.relname IS NULL THEN 'Table missing'
      WHEN c.relrowsecurity THEN 'relrowsecurity = true'
      ELSE 'relrowsecurity = false'
    END::text AS actual,
    CASE
      WHEN c.relname IS NULL THEN 'FAIL'
      WHEN c.relrowsecurity THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN c.relname IS NULL OR NOT c.relrowsecurity THEN 'BLOCKER'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN c.relname IS NULL THEN 'CRITICAL: public.customers table missing.'
      WHEN c.relrowsecurity THEN 'Row Level Security is active on public.customers.'
      ELSE 'CRITICAL: RLS is disabled on public.customers!'
    END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = 'customers'
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')

  UNION ALL

  -- 2. Verify Exact Columns & Types on public.customers
  SELECT
    'COLUMN_POSTFLIGHT'::text AS check_group,
    'customers_required_columns_check'::text AS check_name,
    'public.customers columns'::text AS object_name,
    'All 13 columns present with correct data types and nullability'::text AS expected,
    format('found_columns_count=%s', count(a.attname))::text AS actual,
    CASE
      WHEN count(a.attname) >= 13 THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN count(a.attname) >= 13 THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN count(a.attname) >= 13 THEN 'All 13 required columns verified on public.customers.'
      ELSE 'CRITICAL: Required columns missing from public.customers.'
    END::text AS notes
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  WHERE c.relname = 'customers'
    AND c.relnamespace = 'public'::regnamespace
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IN ('id', 'phone_normalized', 'first_name', 'last_name', 'full_name', 'email', 'status', 'whatsapp_wa_id', 'registration_source', 'phone_verified_at', 'last_seen_at', 'created_at', 'updated_at')

  UNION ALL

  -- 3. Verify Exact CHECK Constraints Content (phone strict regex, status, registration_source)
  SELECT
    'CONSTRAINT_POSTFLIGHT'::text AS check_group,
    'customers_check_constraints_verification'::text AS check_name,
    'public.customers CHECK constraints'::text AS object_name,
    'chk_customers_status, chk_customers_registration_source, chk_customers_phone_normalized (^905[0-9]{9}$) verified'::text AS expected,
    format('found_checks_count=%s, phone_check_valid=%s',
      count(con.conname),
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con2
        JOIN pg_catalog.pg_class c2 ON c2.oid = con2.conrelid
        WHERE c2.relname = 'customers' AND con2.conname = 'chk_customers_phone_normalized'
          AND pg_get_constraintdef(con2.oid) LIKE '%^905[0-9]{9}$%'
      )
    )::text AS actual,
    CASE
      WHEN count(con.conname) >= 3 AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con2
        JOIN pg_catalog.pg_class c2 ON c2.oid = con2.conrelid
        WHERE c2.relname = 'customers' AND con2.conname = 'chk_customers_phone_normalized'
          AND pg_get_constraintdef(con2.oid) LIKE '%^905[0-9]{9}$%'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN count(con.conname) >= 3 AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con2
        JOIN pg_catalog.pg_class c2 ON c2.oid = con2.conrelid
        WHERE c2.relname = 'customers' AND con2.conname = 'chk_customers_phone_normalized'
          AND pg_get_constraintdef(con2.oid) LIKE '%^905[0-9]{9}$%'
      ) THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN count(con.conname) >= 3 AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con2
        JOIN pg_catalog.pg_class c2 ON c2.oid = con2.conrelid
        WHERE c2.relname = 'customers' AND con2.conname = 'chk_customers_phone_normalized'
          AND pg_get_constraintdef(con2.oid) LIKE '%^905[0-9]{9}$%'
      ) THEN 'Required CHECK constraints (status, registration_source, phone_normalized strict ^905) verified.'
      ELSE 'CRITICAL: Required CHECK constraints missing or invalid on public.customers.'
    END::text AS notes
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  WHERE c.relname = 'customers'
    AND c.relnamespace = 'public'::regnamespace
    AND con.contype = 'c'
    AND con.conname IN ('chk_customers_status', 'chk_customers_registration_source', 'chk_customers_phone_normalized')

  UNION ALL

  -- 4. Verify registration_source NO DEFAULT Decision
  SELECT
    'CONSTRAINT_POSTFLIGHT'::text AS check_group,
    'customers_registration_source_no_default_check'::text AS check_name,
    'public.customers.registration_source column default'::text AS object_name,
    'registration_source has NO DEFAULT (default IS NULL)'::text AS expected,
    CASE
      WHEN col.column_default IS NULL THEN 'column_default = NULL (NO DEFAULT)'
      ELSE format('column_default = %s', col.column_default)
    END::text AS actual,
    CASE WHEN col.column_default IS NULL THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN col.column_default IS NULL THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN col.column_default IS NULL THEN 'Verified registration_source has NO DEFAULT to prevent accidental WEB tagging.' ELSE 'CRITICAL: Unexpected default set on registration_source!' END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN information_schema.columns col
    ON col.table_schema = 'public'
   AND col.table_name = 'customers'
   AND col.column_name = 'registration_source'

  UNION ALL

  -- 5. Verify set_customers_updated_at Trigger Function Security, Search Path & EXECUTE REVOKE
  SELECT
    'FUNCTION_POSTFLIGHT'::text AS check_group,
    'customers_updated_at_trigger_function_check'::text AS check_name,
    'public.set_customers_updated_at() function'::text AS object_name,
    'secdef=false (SECURITY INVOKER), search_path=public, pg_temp, public_exec=false'::text AS expected,
    format('secdef=%s, config=%s, public_exec=%s',
      p.prosecdef,
      coalesce(array_to_string(p.proconfig, ','), 'none'),
      CASE WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'true' ELSE 'false' END
    )::text AS actual,
    CASE
      WHEN NOT p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
       AND NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       )
      THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN NOT p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
       AND NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       )
      THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN NOT p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
       AND NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       )
      THEN 'Trigger function SECURITY INVOKER, search_path and PUBLIC execute REVOKE verified.'
      ELSE 'CRITICAL: Trigger function security or execute privilege REVOKE configuration missing!'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_customers_updated_at'

  UNION ALL

  -- 6. Verify Table Privileges (PUBLIC/anon/authenticated false, service_role select/insert/update true, delete false)
  SELECT
    'PRIVILEGE_POSTFLIGHT'::text AS check_group,
    'customers_table_privileges_check'::text AS check_name,
    'public.customers table privileges'::text AS object_name,
    'PUBLIC=none, anon=none, authenticated=none, service_role=SELECT+INSERT+UPDATE (no DELETE)'::text AS expected,
    format('public_acl_present=%s, anon_select=%s, auth_select=%s, service_select=%s, service_delete=%s',
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE c.relname = 'customers' AND c.relnamespace = 'public'::regnamespace AND acl.grantee = 0
      ) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_table_privilege('anon', 'public.customers', 'SELECT') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_table_privilege('authenticated', 'public.customers', 'SELECT') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'SELECT') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'DELETE') THEN 'true' ELSE 'false' END
    )::text AS actual,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE c.relname = 'customers' AND c.relnamespace = 'public'::regnamespace AND acl.grantee = 0
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_table_privilege('anon', 'public.customers', 'SELECT'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_table_privilege('authenticated', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'INSERT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'UPDATE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'DELETE'))
      THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE c.relname = 'customers' AND c.relnamespace = 'public'::regnamespace AND acl.grantee = 0
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_table_privilege('anon', 'public.customers', 'SELECT'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_table_privilege('authenticated', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'INSERT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'UPDATE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'DELETE'))
      THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE c.relname = 'customers' AND c.relnamespace = 'public'::regnamespace AND acl.grantee = 0
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_table_privilege('anon', 'public.customers', 'SELECT'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_table_privilege('authenticated', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'SELECT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'INSERT'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'UPDATE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_table_privilege('service_role', 'public.customers', 'DELETE'))
      THEN 'Table privileges verified: PUBLIC/anon/auth revoked, service_role granted SELECT/INSERT/UPDATE, DELETE denied.'
      ELSE 'CRITICAL: Table privileges mismatch on public.customers!'
    END::text AS notes

  UNION ALL

  -- 7. Verify orders.customer_id FK Link, Nullability & Index
  SELECT
    'ORDERS_LINK_POSTFLIGHT'::text AS check_group,
    'orders_customer_id_fk_check'::text AS check_name,
    'public.orders.customer_id column'::text AS object_name,
    'customer_id UUID NULL, FK fk_orders_customer_id ON DELETE RESTRICT, index idx_orders_customer_id exists'::text AS expected,
    format('col_exists=%s, nullable=%s, fk_name=%s, fk_deltype=%s, idx_exists=%s',
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id'
      ),
      (
        SELECT a.attnotnull = false FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id'
      ),
      coalesce((
        SELECT con.conname FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id'
      ), 'missing'),
      coalesce((
        SELECT con.confdeltype::text FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id'
      ), 'none'),
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'idx_orders_customer_id'
      )
    )::text AS actual,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id' AND a.attnotnull = false
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id' AND con.confdeltype = 'r'
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'idx_orders_customer_id'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id' AND a.attnotnull = false
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id' AND con.confdeltype = 'r'
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'idx_orders_customer_id'
      ) THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id' AND a.attnotnull = false
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id' AND con.confdeltype = 'r'
      )
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'idx_orders_customer_id'
      ) THEN 'orders.customer_id FK link (ON DELETE RESTRICT) and index verified.'
      ELSE 'CRITICAL: orders.customer_id link, FK constraint or index missing/invalid!'
    END::text AS notes

  UNION ALL

  -- 8. Verify Historic Snapshot Fields Preservation on orders
  SELECT
    'SNAPSHOT_POSTFLIGHT'::text AS check_group,
    'orders_snapshot_fields_preservation_check'::text AS check_name,
    'public.orders customer snapshot fields'::text AS object_name,
    'customer_name, customer_phone, customer_email preserved intact'::text AS expected,
    format('snapshot_cols_count=%s', count(a.attname))::text AS actual,
    CASE WHEN count(a.attname) >= 3 THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN count(a.attname) >= 3 THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN count(a.attname) >= 3 THEN 'Historic order customer snapshot fields preserved intact.' ELSE 'CRITICAL: Customer snapshot fields missing on orders!' END::text AS notes
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  WHERE c.relname = 'orders'
    AND c.relnamespace = 'public'::regnamespace
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IN ('customer_name', 'customer_phone', 'customer_email')

  UNION ALL

  -- 9. Verify credit_customers Isolation & Integrity
  SELECT
    'CREDIT_POSTFLIGHT'::text AS check_group,
    'credit_customers_isolation_check'::text AS check_name,
    'public.credit_customers table'::text AS object_name,
    'credit_customers intact and isolated (no forced FK / substitute)'::text AS expected,
    CASE
      WHEN c.relname IS NOT NULL THEN 'credit_customers intact'
      ELSE 'credit_customers missing'
    END::text AS actual,
    CASE WHEN c.relname IS NOT NULL THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN c.relname IS NOT NULL THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN c.relname IS NOT NULL THEN 'public.credit_customers table remains intact for HurCELL Limit/Cari ledger.' ELSE 'CRITICAL: credit_customers missing!' END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = 'credit_customers'
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
)

SELECT *
FROM all_results
ORDER BY
  CASE check_group
    WHEN 'TABLE_POSTFLIGHT' THEN 1
    WHEN 'COLUMN_POSTFLIGHT' THEN 2
    WHEN 'CONSTRAINT_POSTFLIGHT' THEN 3
    WHEN 'FUNCTION_POSTFLIGHT' THEN 4
    WHEN 'PRIVILEGE_POSTFLIGHT' THEN 5
    WHEN 'ORDERS_LINK_POSTFLIGHT' THEN 6
    WHEN 'SNAPSHOT_POSTFLIGHT' THEN 7
    ELSE 8
  END,
  check_name;
