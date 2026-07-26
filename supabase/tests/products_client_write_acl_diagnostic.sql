-- supabase/tests/products_client_write_acl_diagnostic.sql
-- Pure Read-Only Diagnostic for public.products Client Write ACL Failure
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
    a.privilege_type,
    a.is_grantable,
    pg_get_userbyid(a.grantor) AS grantor_name
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
    bool_or(privilege_type = 'TRIGGER') AS can_trigger,
    string_agg(DISTINCT grantor_name, ', ') AS grantors,
    bool_or(is_grantable) AS is_grantable
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
)
-- 1. PUBLIC Pseudo-Role Summary (Direct ACL Metadata)
SELECT
  'DIRECT_ACL_PUBLIC' AS diagnostic_section,
  'PUBLIC' AS grantee_role,
  COALESCE(ps.can_select, false) AS can_select,
  COALESCE(ps.can_insert, false) AS can_insert,
  COALESCE(ps.can_update, false) AS can_update,
  COALESCE(ps.can_delete, false) AS can_delete,
  COALESCE(ps.can_truncate, false) AS can_truncate,
  COALESCE(ps.can_references, false) AS can_references,
  COALESCE(ps.can_trigger, false) AS can_trigger,
  COALESCE(ps.grantors, 'POSTGRES_DEFAULT') AS grantor,
  COALESCE(ps.is_grantable, false) AS is_grantable,
  ri.rls_enabled,
  ri.rls_forced,
  CASE WHEN COALESCE(ps.can_insert, false) OR COALESCE(ps.can_update, false) OR COALESCE(ps.can_delete, false) THEN 'SECURITY_RISK' ELSE 'SAFE' END AS status,
  'PUBLIC pseudo-role direct privileges derived from relacl (grantee=0). Applies universally.' AS diagnostic_notes
FROM rel_info ri
LEFT JOIN public_summary ps ON true

UNION ALL

-- 2. Real Roles Effective Privileges Summary
SELECT
  'EFFECTIVE_PRIVILEGES_REAL_ROLES' AS diagnostic_section,
  res.grantee_role,
  res.can_select,
  res.can_insert,
  res.can_update,
  res.can_delete,
  res.can_truncate,
  res.can_references,
  res.can_trigger,
  'SYSTEM_EVALUATED' AS grantor,
  false AS is_grantable,
  ri.rls_enabled,
  ri.rls_forced,
  CASE
    WHEN res.grantee_role IN ('anon', 'authenticated') AND (res.can_insert OR res.can_update OR res.can_delete) THEN 'SECURITY_RISK'
    ELSE 'SAFE'
  END AS status,
  'Effective privileges derived via has_table_privilege for valid pg_roles.' AS diagnostic_notes
FROM role_effective_summary res
CROSS JOIN rel_info ri

UNION ALL

-- 3. Policy Snapshot Diagnostic
SELECT
  'POLICY_SNAPSHOT' AS diagnostic_section,
  COALESCE(p.policyname, 'NO_POLICIES') AS grantee_role,
  (p.cmd = 'SELECT' OR p.cmd = 'ALL') AS can_select,
  (p.cmd = 'INSERT' OR p.cmd = 'ALL') AS can_insert,
  (p.cmd = 'UPDATE' OR p.cmd = 'ALL') AS can_update,
  (p.cmd = 'DELETE' OR p.cmd = 'ALL') AS can_delete,
  false AS can_truncate,
  false AS can_references,
  false AS can_trigger,
  'POLICY_AUTHOR' AS grantor,
  false AS is_grantable,
  ri.rls_enabled,
  ri.rls_forced,
  CASE WHEN p.cmd <> 'SELECT' AND p.cmd IS NOT NULL THEN 'POLICY_WARNING' ELSE 'PASS' END AS status,
  'Policy: ' || COALESCE(p.policyname, 'NONE') || ' | Roles: ' || array_to_string(p.roles, ', ') || ' | Cmd: ' || COALESCE(p.cmd, 'NONE') AS diagnostic_notes
FROM rel_info ri
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = 'products'

ORDER BY diagnostic_section, grantee_role;
