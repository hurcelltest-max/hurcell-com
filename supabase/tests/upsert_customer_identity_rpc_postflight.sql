-- ============================================================================
-- Postflight Verification Script: Upsert Customer Identity RPC (Paket C1 Final Hardened)
-- Target: Supabase Database (Run AFTER applying Paket C1 Migration)
-- ============================================================================
-- IMPORTANT WARNING & SAFETY DIRECTIVES:
-- 1. READ-ONLY METADATA AUDIT ONLY: Strictly uses SELECT and pg_catalog metadata.
-- 2. NO RPC EXECUTION, NO PII DATA READS, NO CUSTOMER INSERTIONS, NO DML/DDL.
-- 3. SAFE TO EXECUTE TO VERIFY PAKET C1 RPC POSTURE.
-- ============================================================================

WITH all_results AS (
  -- 1. Verify upsert_customer_identity RPC existence and OID via to_regprocedure
  SELECT
    'RPC_EXISTENCE'::text AS check_group,
    'rpc_existence_check'::text AS check_name,
    'public.upsert_customer_identity RPC'::text AS object_name,
    'RPC function exists with exact signature'::text AS expected,
    CASE
      WHEN p.proname IS NOT NULL THEN 'RPC function exists'
      ELSE 'RPC function MISSING'
    END::text AS actual,
    CASE WHEN p.proname IS NOT NULL THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN p.proname IS NOT NULL THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN p.proname IS NOT NULL THEN 'RPC public.upsert_customer_identity verified.' ELSE 'CRITICAL: RPC public.upsert_customer_identity missing!' END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_proc p
    ON p.oid = to_regprocedure('public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text)')

  UNION ALL

  -- 2. Verify SECURITY DEFINER and search_path
  SELECT
    'RPC_SECURITY'::text AS check_group,
    'rpc_security_definer_and_search_path_check'::text AS check_name,
    'public.upsert_customer_identity security properties'::text AS object_name,
    'prosecdef=true (SECURITY DEFINER), search_path=public, pg_temp'::text AS expected,
    format('secdef=%s, config=%s', p.prosecdef, coalesce(array_to_string(p.proconfig, ','), 'none'))::text AS actual,
    CASE
      WHEN p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
      THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
      THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN p.prosecdef
       AND p.proconfig IS NOT NULL
       AND ('search_path=public, pg_temp' = ANY(p.proconfig) OR 'search_path=public' = ANY(p.proconfig))
      THEN 'RPC SECURITY DEFINER and search_path verified.'
      ELSE 'CRITICAL: RPC SECURITY DEFINER or search_path configuration missing!'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text)')

  UNION ALL

  -- 3. Verify RPC Privileges (PUBLIC/anon/authenticated false, service_role execute true)
  SELECT
    'RPC_PRIVILEGE'::text AS check_group,
    'rpc_execute_privileges_check'::text AS check_name,
    'public.upsert_customer_identity EXECUTE privileges'::text AS object_name,
    'PUBLIC=false, anon=false, authenticated=false, service_role=true'::text AS expected,
    format('public_exec=%s, anon_exec=%s, auth_exec=%s, service_exec=%s',
      CASE WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'true' ELSE 'false' END
    )::text AS actual,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_function_privilege('anon', p.oid, 'EXECUTE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
      THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_function_privilege('anon', p.oid, 'EXECUTE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
      THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') AND has_function_privilege('anon', p.oid, 'EXECUTE'))
       AND NOT (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       AND (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') AND has_function_privilege('service_role', p.oid, 'EXECUTE'))
      THEN 'RPC EXECUTE privileges verified: PUBLIC/anon/auth revoked, service_role granted.'
      ELSE 'CRITICAL: RPC EXECUTE privilege mismatch!'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text)')

  UNION ALL

  -- 4. Verify RPC Function Body Scope & Safety Checks
  SELECT
    'RPC_BODY_SAFETY'::text AS check_group,
    'rpc_body_safety_check'::text AS check_name,
    'public.upsert_customer_identity body code'::text AS object_name,
    'Contains INSERT INTO public.customers, ON CONFLICT, UPDATE public.customers, last_seen_at, zero-row guard, no forbidden DML or EXECUTE'::text AS expected,
    format('has_insert=%s, has_update=%s, has_conflict=%s, has_zero_guard=%s, has_forbidden=%s',
      (p.prosrc LIKE '%INSERT INTO public.customers%'),
      (p.prosrc LIKE '%UPDATE public.customers%'),
      (p.prosrc LIKE '%ON CONFLICT%'),
      (p.prosrc LIKE '%Zero rows updated%'),
      (
        p.prosrc LIKE '%DELETE FROM%'
        OR p.prosrc LIKE '%EXECUTE %'
        OR p.prosrc LIKE '%public.orders%'
        OR p.prosrc LIKE '%public.products%'
        OR p.prosrc LIKE '%credit_%'
        OR p.prosrc LIKE '%phone_verifications%'
      )
    )::text AS actual,
    CASE
      WHEN (p.prosrc LIKE '%INSERT INTO public.customers%')
       AND (p.prosrc LIKE '%UPDATE public.customers%')
       AND (p.prosrc LIKE '%ON CONFLICT%')
       AND (p.prosrc LIKE '%Zero rows updated%')
       AND NOT (
         p.prosrc LIKE '%DELETE FROM%'
         OR p.prosrc LIKE '%EXECUTE %'
         OR p.prosrc LIKE '%public.orders%'
         OR p.prosrc LIKE '%public.products%'
         OR p.prosrc LIKE '%credit_%'
         OR p.prosrc LIKE '%phone_verifications%'
       )
      THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN (p.prosrc LIKE '%INSERT INTO public.customers%')
       AND (p.prosrc LIKE '%UPDATE public.customers%')
       AND (p.prosrc LIKE '%ON CONFLICT%')
       AND (p.prosrc LIKE '%Zero rows updated%')
       AND NOT (
         p.prosrc LIKE '%DELETE FROM%'
         OR p.prosrc LIKE '%EXECUTE %'
         OR p.prosrc LIKE '%public.orders%'
         OR p.prosrc LIKE '%public.products%'
         OR p.prosrc LIKE '%credit_%'
         OR p.prosrc LIKE '%phone_verifications%'
       )
      THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN (p.prosrc LIKE '%INSERT INTO public.customers%')
       AND (p.prosrc LIKE '%UPDATE public.customers%')
       AND (p.prosrc LIKE '%ON CONFLICT%')
       AND (p.prosrc LIKE '%Zero rows updated%')
       AND NOT (
         p.prosrc LIKE '%DELETE FROM%'
         OR p.prosrc LIKE '%EXECUTE %'
         OR p.prosrc LIKE '%public.orders%'
         OR p.prosrc LIKE '%public.products%'
         OR p.prosrc LIKE '%credit_%'
         OR p.prosrc LIKE '%phone_verifications%'
       )
      THEN 'RPC body static safety checks passed: Schema-qualified public.customers upsert with zero-row guard and zero forbidden statements.'
      ELSE 'CRITICAL: RPC body contains invalid, missing or forbidden statements!'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text)')
)

SELECT *
FROM all_results
ORDER BY
  CASE check_group
    WHEN 'RPC_EXISTENCE' THEN 1
    WHEN 'RPC_SECURITY' THEN 2
    WHEN 'RPC_PRIVILEGE' THEN 3
    ELSE 4
  END,
  check_name;
