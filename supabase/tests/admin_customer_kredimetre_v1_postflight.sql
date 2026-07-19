-- Postflight Test: Admin Customer Kredimetre V1 Verification
-- Created At: 2026-07-19T22:19:44Z

SELECT
  -- Function metadata checks
  f_exists AS function_exists,
  f_args AS args_count_ok,
  f_argtypes AS arg_types_ok,
  f_rettype AS returns_jsonb,
  f_secdef AS security_definer,
  f_path AS search_path_ok,

  -- Privileges
  priv_service AS service_role_execute,
  public_revoke_ok AS public_execute_false,
  NOT priv_anon AS anon_execute_false,
  NOT priv_auth AS authenticated_execute_false,

  -- Indexes
  idx1_ok AND idx2_ok AS required_indexes_ok,

  -- Smoke Check
  rpc_smoke_ok,

  -- Overall
  (f_exists AND f_args AND f_argtypes AND f_rettype AND f_secdef AND f_path
   AND priv_service AND public_revoke_ok AND NOT priv_anon AND NOT priv_auth
   AND idx1_ok AND idx2_ok AND rpc_smoke_ok) AS overall_ok
FROM (
  SELECT
    -- Resolve exact function OID
    (oid IS NOT NULL) AS f_exists,
    (pronargs = 5) AS f_args,
    (oidvectortypes(proargtypes) = 'text, text, text, integer, integer') AS f_argtypes,
    (prorettype = 'jsonb'::regtype) AS f_rettype,
    prosecdef AS f_secdef,
    (array_to_string(proconfig, ',') ILIKE '%search_path=public, pg_temp%') AS f_path,

    -- Privilege checks using OID
    has_function_privilege('service_role', oid, 'EXECUTE') AS priv_service,
    has_function_privilege('anon', oid, 'EXECUTE') AS priv_anon,
    has_function_privilege('authenticated', oid, 'EXECUTE') AS priv_auth,

    -- PUBLIC execute check via ACL (grantee = 0 matches PUBLIC role)
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p,
      LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = to_regprocedure('public.get_admin_credit_customers_with_scores(text,text,text,integer,integer)')
        AND a.grantee = 0
        AND a.privilege_type = 'EXECUTE'
    ) AS public_revoke_ok,

    -- Index checks with indexdef verification
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'finance_installments'
        AND indexname = 'idx_finance_installments_plan_due'
        AND indexdef ILIKE '%finance_plan_id%' AND indexdef ILIKE '%due_date%'
    ) AS idx1_ok,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'finance_collections'
        AND indexname = 'idx_finance_collections_plan_collected'
        AND indexdef ILIKE '%finance_plan_id%' AND indexdef ILIKE '%collected_at%'
    ) AS idx2_ok,

    -- Runtime Smoke Check
    (
      SELECT
        jsonb_typeof(smoke_res) = 'object'
        AND jsonb_typeof(smoke_res->'data') = 'array'
        AND jsonb_typeof(smoke_res->'pagination') = 'object'
        AND jsonb_typeof(smoke_res->'counts') = 'object'
      FROM (
        SELECT public.get_admin_credit_customers_with_scores(NULL, NULL, NULL, 1, 1) AS smoke_res
      ) s
    ) AS rpc_smoke_ok

  FROM pg_proc
  WHERE oid = to_regprocedure('public.get_admin_credit_customers_with_scores(text,text,text,integer,integer)')
) checks;
