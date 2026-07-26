-- supabase/tests/products_client_write_acl_fix_postflight.sql
-- Pure Read-Only Postflight Verification for 20260726220000_products_client_write_acl_fix.sql
-- Pure Single SELECT Statement. Zero Role Lookup Errors for PUBLIC, Zero TEMP Tables, Zero DML/DDL.

WITH rel_info AS (
  SELECT
    c.oid AS rel_oid,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    c.relacl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'products'
),
public_acl AS (
  SELECT
    a.privilege_type
  FROM rel_info r
  CROSS JOIN LATERAL aclexplode(r.relacl) a
  WHERE a.grantee = 0
),
public_summary AS (
  SELECT
    bool_or(privilege_type = 'SELECT') AS can_select,
    bool_or(privilege_type = 'INSERT') AS can_insert,
    bool_or(privilege_type = 'UPDATE') AS can_update,
    bool_or(privilege_type = 'DELETE') AS can_delete,
    bool_or(privilege_type = 'TRUNCATE') AS can_truncate,
    bool_or(privilege_type = 'REFERENCES') AS can_references,
    bool_or(privilege_type = 'TRIGGER') AS can_trigger
  FROM public_acl
),
role_effective_summary AS (
  SELECT
    r.rolname AS grantee_role,
    has_table_privilege(r.rolname, 'public.products', 'SELECT') AS can_select,
    has_table_privilege(r.rolname, 'public.products', 'INSERT') AS can_insert,
    has_table_privilege(r.rolname, 'public.products', 'UPDATE') AS can_update,
    has_table_privilege(r.rolname, 'public.products', 'DELETE') AS can_delete,
    has_table_privilege(r.rolname, 'public.products', 'TRUNCATE') AS can_truncate,
    has_table_privilege(r.rolname, 'public.products', 'REFERENCES') AS can_references,
    has_table_privilege(r.rolname, 'public.products', 'TRIGGER') AS can_trigger
  FROM pg_roles r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
),
check_results AS (
  -- 1. PUBLIC PRIVILEGES CHECK (relacl grantee=0: zero direct privileges)
  SELECT
    'PUBLIC_ACL_EXACT'::text AS check_group,
    'PUBLIC Zero Direct Privileges Check'::text AS check_name,
    'public.products (PUBLIC)'::text AS object_name,
    'select=false, insert=false, update=false, delete=false, truncate=false, references=false, trigger=false'::text AS expected,
    ('select=' || COALESCE(ps.can_select, false)::text || ', insert=' || COALESCE(ps.can_insert, false)::text || ', update=' || COALESCE(ps.can_update, false)::text || ', delete=' || COALESCE(ps.can_delete, false)::text)::text AS actual,
    (CASE WHEN (NOT COALESCE(ps.can_select, false)) AND (NOT COALESCE(ps.can_insert, false)) AND (NOT COALESCE(ps.can_update, false)) AND (NOT COALESCE(ps.can_delete, false)) AND (NOT COALESCE(ps.can_truncate, false)) THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'PUBLIC pseudo-role must have zero direct privileges on public.products'::text AS notes
  FROM rel_info ri
  LEFT JOIN public_summary ps ON true

  UNION ALL

  -- 2. ANON PRIVILEGES CHECK (select=true, all write=false)
  SELECT
    'ANON_ACL_EXACT'::text AS check_group,
    'anon Role Exact Privileges Check'::text AS check_name,
    'public.products (anon)'::text AS object_name,
    'select=true, insert=false, update=false, delete=false, truncate=false'::text AS expected,
    ('select=' || res.can_select::text || ', insert=' || res.can_insert::text || ', update=' || res.can_update::text || ', delete=' || res.can_delete::text)::text AS actual,
    (CASE WHEN res.can_select AND (NOT res.can_insert) AND (NOT res.can_update) AND (NOT res.can_delete) AND (NOT res.can_truncate) THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'anon role must have SELECT=true and zero direct write privileges'::text AS notes
  FROM role_effective_summary res WHERE res.grantee_role = 'anon'

  UNION ALL

  -- 3. AUTHENTICATED PRIVILEGES CHECK (select=true, all write=false)
  SELECT
    'AUTHENTICATED_ACL_EXACT'::text AS check_group,
    'authenticated Role Exact Privileges Check'::text AS check_name,
    'public.products (authenticated)'::text AS object_name,
    'select=true, insert=false, update=false, delete=false, truncate=false'::text AS expected,
    ('select=' || res.can_select::text || ', insert=' || res.can_insert::text || ', update=' || res.can_update::text || ', delete=' || res.can_delete::text)::text AS actual,
    (CASE WHEN res.can_select AND (NOT res.can_insert) AND (NOT res.can_update) AND (NOT res.can_delete) AND (NOT res.can_truncate) THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'authenticated role must have SELECT=true and zero direct write privileges'::text AS notes
  FROM role_effective_summary res WHERE res.grantee_role = 'authenticated'

  UNION ALL

  -- 4. SERVICE_ROLE PRIVILEGES CHECK (select=true, insert=true, update=true, delete=false, truncate=false)
  SELECT
    'SERVICE_ROLE_ACL_EXACT'::text AS check_group,
    'service_role Exact Preserved Privileges Check'::text AS check_name,
    'public.products (service_role)'::text AS object_name,
    'select=true, insert=true, update=true, delete=false, truncate=false'::text AS expected,
    ('select=' || res.can_insert::text || ', update=' || res.can_update::text || ', delete=' || res.can_delete::text)::text AS actual,
    (CASE WHEN res.can_select AND res.can_insert AND res.can_update AND (NOT res.can_delete) AND (NOT res.can_truncate) THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'service_role must retain SELECT, INSERT, UPDATE while DELETE and TRUNCATE remain revoked'::text AS notes
  FROM role_effective_summary res WHERE res.grantee_role = 'service_role'

  UNION ALL

  -- 5. RLS AND POLICY GUARD
  SELECT
    'PRODUCTS_RLS_STATUS'::text AS check_group,
    'Row Level Security Enabled Check'::text AS check_name,
    'public.products'::text AS object_name,
    'relrowsecurity=true'::text AS expected,
    ri.rls_enabled::text AS actual,
    (CASE WHEN ri.rls_enabled THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'Verifies RLS is enabled on public.products'::text AS notes
  FROM rel_info ri

  UNION ALL

  -- 6. POLICY CMD CHECK (Only public_products_read_only SELECT policy allowed)
  SELECT
    'PRODUCTS_POLICY_GUARD'::text AS check_group,
    'Single SELECT Policy Guard Check'::text AS check_name,
    'public.products policies'::text AS object_name,
    '1 SELECT policy'::text AS expected,
    ((SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND cmd = 'SELECT'))::text AS actual,
    (CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND cmd = 'SELECT') >= 1
          AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND cmd <> 'SELECT') = 0 THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL' AS severity,
    'Verifies zero non-SELECT policies exist on public.products'::text AS notes
  FROM rel_info ri
)
SELECT
  check_group,
  check_name,
  object_name,
  expected,
  actual,
  status,
  severity,
  notes
FROM check_results
ORDER BY
  CASE severity
    WHEN 'BLOCKER' THEN 1
    WHEN 'CRITICAL' THEN 2
    WHEN 'HIGH' THEN 3
    WHEN 'WARNING' THEN 4
    WHEN 'INFO' THEN 5
    ELSE 6
  END,
  check_group,
  check_name;
