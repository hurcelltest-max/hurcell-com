-- ============================================================================
-- Postflight Metadata Verification Script (Strict Read-Only Hardened)
-- Target: Supabase Production Database (Run AFTER applying Paket A Migration)
-- ============================================================================
-- IMPORTANT WARNING & SAFETY DIRECTIVES:
-- 1. READ-ONLY METADATA AUDIT ONLY: Strictly uses SELECT and pg_catalog metadata.
-- 2. NO RPC INVOCATION WITH PARAMETERS, NO DATA MUTATION, NO PII READS.
-- 3. SAFE TO EXECUTE AFTER MIGRATION TO VERIFY SECURITY POSTURE.
-- ============================================================================

WITH all_results AS (
  -- ==========================================================================
  -- 1. RPC Overload & Security Hardening Verification (Using Regprocedure)
  -- ==========================================================================
  SELECT
    'FUNCTION_POSTFLIGHT'::text AS check_group,
    'rpc_decrement_product_stock_safe_security'::text AS check_name,
    format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))::text AS object_name,
    'secdef=true, search_path=public, pg_temp, public_exec=false, anon_exec=false, auth_exec=false, service_role_exec=true'::text AS expected,
    format('oid=%s, secdef=%s, config=%s, public_exec=%s, anon_exec=%s, auth_exec=%s, service_role_exec=%s, supabase_roles_present=%s',
      p.oid,
      p.prosecdef,
      coalesce(array_to_string(p.proconfig, ','), 'none'),
      CASE WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
            AND has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
            AND has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'true' ELSE 'false' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
            AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'true' ELSE 'false/role_missing' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
            AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
            AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
           THEN 'true' ELSE 'false (expected Supabase role missing)' END
    )::text AS actual,
    CASE
      -- FAIL if required Supabase roles are missing in pg_roles
      WHEN NOT (
        EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      ) THEN 'FAIL'
      -- FAIL if SECURITY DEFINER is false
      WHEN NOT p.prosecdef THEN 'FAIL'
      -- FAIL if search_path does not contain BOTH public AND pg_temp
      WHEN p.proconfig IS NULL OR NOT (
        array_to_string(p.proconfig, ',') ~* 'search_path=.*public'
        AND array_to_string(p.proconfig, ',') ~* 'search_path=.*pg_temp'
      ) THEN 'FAIL'
      -- FAIL if PUBLIC execute is true
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'FAIL'
      -- FAIL if anon execute is true
      WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'FAIL'
      -- FAIL if authenticated execute is true
      WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'FAIL'
      -- FAIL if service_role execute is false
      WHEN NOT has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'FAIL'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN NOT (
        EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      )
      OR NOT p.prosecdef
      OR p.proconfig IS NULL
      OR NOT (
        array_to_string(p.proconfig, ',') ~* 'search_path=.*public'
        AND array_to_string(p.proconfig, ',') ~* 'search_path=.*pg_temp'
      )
      OR EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
      OR has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      THEN 'BLOCKER'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN NOT (
        EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      ) THEN 'CRITICAL: Expected Supabase role missing from database pg_roles.'
      WHEN NOT p.prosecdef THEN 'CRITICAL: RPC must be SECURITY DEFINER.'
      WHEN p.proconfig IS NULL OR NOT (
        array_to_string(p.proconfig, ',') ~* 'search_path=.*public'
        AND array_to_string(p.proconfig, ',') ~* 'search_path=.*pg_temp'
      ) THEN 'CRITICAL: Fixed search_path must contain BOTH public AND pg_temp. search_path=public alone is insufficient.'
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN 'CRITICAL: PUBLIC execute is enabled on stock decrement RPC!'
      WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'CRITICAL: anon execute enabled!'
      WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'CRITICAL: authenticated execute enabled!'
      WHEN NOT has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'CRITICAL: service_role execute denied!'
      ELSE 'Stock RPC search_path (public, pg_temp), SECURITY DEFINER, and execute privilege hardening verified PASS.'
    END::text AS notes
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'decrement_product_stock_safe'
    AND (
      to_regprocedure('public.decrement_product_stock_safe(uuid,integer)') IS NOT NULL
      AND p.oid = to_regprocedure('public.decrement_product_stock_safe(uuid,integer)')
    )

  UNION ALL

  -- Fallback ONLY if exact overload decrement_product_stock_safe(uuid, integer) is missing
  SELECT
    'FUNCTION_POSTFLIGHT'::text AS check_group,
    'rpc_decrement_product_stock_safe_missing'::text AS check_name,
    'public.decrement_product_stock_safe(uuid, integer)'::text AS object_name,
    'Function exists with exact signature (uuid, integer)'::text AS expected,
    'exact function signature missing'::text AS actual,
    'FAIL'::text AS status,
    'BLOCKER'::text AS severity,
    'CRITICAL: Exact overload public.decrement_product_stock_safe(uuid, integer) missing from public schema.'::text AS notes
  WHERE to_regprocedure('public.decrement_product_stock_safe(uuid,integer)') IS NULL

  UNION ALL

  -- ==========================================================================
  -- 2. Products RLS Enabled Verification
  -- ==========================================================================
  SELECT
    'POLICY_POSTFLIGHT'::text AS check_group,
    'products_rls_enabled_check'::text AS check_name,
    'public.products table'::text AS object_name,
    'relrowsecurity = true (RLS enabled)'::text AS expected,
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
      WHEN c.relname IS NULL THEN 'BLOCKER'
      WHEN c.relrowsecurity THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN c.relname IS NULL THEN 'CRITICAL: public.products table missing.'
      WHEN c.relrowsecurity THEN 'Row Level Security is active on public.products.'
      ELSE 'CRITICAL: RLS is disabled on public.products; SELECT policy alone cannot secure table!'
    END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = 'products'
   AND c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')

  UNION ALL

  -- ==========================================================================
  -- 3. Expected Policy Existence Check (public_products_read_only TO public)
  -- ==========================================================================
  SELECT
    'POLICY_POSTFLIGHT'::text AS check_group,
    'products_expected_read_only_policy_check'::text AS check_name,
    'public.products policy [public_products_read_only]'::text AS object_name,
    'Policy exists, cmd=SELECT, roles={public}, qual=(true)'::text AS expected,
    CASE
      WHEN p.policyname IS NULL THEN 'Policy missing'
      ELSE format('cmd=%s, roles=%s, qual=(%s)', p.cmd, array_to_string(p.roles, ','), coalesce(p.qual, 'none'))
    END::text AS actual,
    CASE
      WHEN p.policyname IS NULL THEN 'FAIL'
      WHEN p.cmd = 'SELECT' AND 'public' = ANY(p.roles) AND coalesce(p.qual, 'none') = 'true' THEN 'PASS'
      ELSE 'FAIL'
    END::text AS status,
    CASE
      WHEN p.policyname IS NULL THEN 'BLOCKER'
      WHEN p.cmd = 'SELECT' AND 'public' = ANY(p.roles) AND coalesce(p.qual, 'none') = 'true' THEN 'INFO'
      ELSE 'BLOCKER'
    END::text AS severity,
    CASE
      WHEN p.policyname IS NULL THEN 'CRITICAL: Expected policy public_products_read_only is missing!'
      WHEN p.cmd <> 'SELECT' THEN format('CRITICAL: Expected SELECT policy has invalid command %s', p.cmd)
      WHEN NOT ('public' = ANY(p.roles)) THEN 'CRITICAL: Expected SELECT policy does not explicitly target the public role.'
      WHEN coalesce(p.qual, 'none') <> 'true' THEN format('CRITICAL: Policy qual condition (%s) is not true.', coalesce(p.qual, 'none'))
      ELSE 'Expected public_products_read_only FOR SELECT TO public USING (true) policy verified.'
    END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = 'products'
   AND p.policyname = 'public_products_read_only'

  UNION ALL

  -- ==========================================================================
  -- 4. Unsafe Policy Absence Verification
  -- ==========================================================================
  -- 4A. Check absence of "Public Access"
  SELECT
    'POLICY_POSTFLIGHT'::text AS check_group,
    'products_absence_public_access_policy'::text AS check_name,
    'public.products policy ["Public Access"]'::text AS object_name,
    'Unsafe "Public Access" policy removed'::text AS expected,
    CASE
      WHEN p.policyname IS NOT NULL THEN format('Unsafe policy remains: cmd=%s, roles=%s', p.cmd, array_to_string(p.roles, ','))
      ELSE 'Policy successfully removed'
    END::text AS actual,
    CASE WHEN p.policyname IS NULL THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN p.policyname IS NULL THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN p.policyname IS NULL THEN 'Unsafe "Public Access" policy verified absent.' ELSE 'CRITICAL: "Public Access" policy still exists in DB!' END::text AS notes
  FROM (SELECT 1) _dummy
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public' AND p.tablename = 'products' AND p.policyname = 'Public Access'

  UNION ALL

  -- 4B. Check absence of "Public can view web visible products"
  SELECT
    'POLICY_POSTFLIGHT'::text AS check_group,
    'products_absence_public_can_view_web_visible_policy'::text AS check_name,
    'public.products policy ["Public can view web visible products"]'::text AS object_name,
    'Legacy policy removed'::text AS expected,
    CASE
      WHEN p.policyname IS NOT NULL THEN format('Legacy policy remains: cmd=%s', p.cmd)
      ELSE 'Policy successfully removed'
    END::text AS actual,
    CASE WHEN p.policyname IS NULL THEN 'PASS' ELSE 'FAIL' END::text AS status,
    CASE WHEN p.policyname IS NULL THEN 'INFO' ELSE 'BLOCKER' END::text AS severity,
    CASE WHEN p.policyname IS NULL THEN 'Legacy policy verified absent.' ELSE 'CRITICAL: Legacy policy still exists in DB!' END::text AS notes
  FROM (SELECT 1) _dummy2
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public' AND p.tablename = 'products' AND p.policyname = 'Public can view web visible products'

  UNION ALL

  -- 4C. Check absence of any unauthenticated write policy (cmd = ALL / INSERT / UPDATE / DELETE)
  SELECT
    'POLICY_POSTFLIGHT'::text AS check_group,
    'products_absence_unauthenticated_write_policies'::text AS check_name,
    'public.products table policies'::text AS object_name,
    'Zero unauthenticated ALL/INSERT/UPDATE/DELETE policies'::text AS expected,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'products'
          AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          AND ('public' = ANY(p.roles) OR 'anon' = ANY(p.roles))
      ) THEN 'Unauthenticated write policy detected!'
      ELSE 'Zero unauthenticated write policies'
    END::text AS actual,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'products'
          AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          AND ('public' = ANY(p.roles) OR 'anon' = ANY(p.roles))
      ) THEN 'FAIL'
      ELSE 'PASS'
    END::text AS status,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'products'
          AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          AND ('public' = ANY(p.roles) OR 'anon' = ANY(p.roles))
      ) THEN 'BLOCKER'
      ELSE 'INFO'
    END::text AS severity,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'products'
          AND p.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          AND ('public' = ANY(p.roles) OR 'anon' = ANY(p.roles))
      ) THEN 'CRITICAL: Unauthenticated write path policy detected on public.products!'
      ELSE 'Verified zero unauthenticated write policies remain on public.products.'
    END::text AS notes
  FROM (SELECT 1) _dummy3
)

-- ============================================================================
-- Outer SELECT with Order By
-- ============================================================================
SELECT *
FROM all_results
ORDER BY
  CASE check_group
    WHEN 'FUNCTION_POSTFLIGHT' THEN 1
    WHEN 'POLICY_POSTFLIGHT' THEN 2
    ELSE 3
  END,
  CASE severity
    WHEN 'BLOCKER' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    ELSE 5
  END,
  check_name;
