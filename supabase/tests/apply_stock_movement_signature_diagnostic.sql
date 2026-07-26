-- supabase/tests/apply_stock_movement_signature_diagnostic.sql
-- Pure Read-Only Signature Diagnostic for public.apply_stock_movement RPC in Production DB
-- Pure Single SELECT Statement. Safe to_regprocedure. Zero RPC Invocation, Zero DML/DDL.

SELECT
  'RPC_SIGNATURE_DIAGNOSTIC' AS diagnostic_section,
  p.oid AS function_oid,
  n.nspname || '.' || p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_arguments(p.oid) AS full_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS is_security_definer,
  COALESCE(array_to_string(p.proconfig, ', '), 'NONE') AS search_path_config,
  pg_get_userbyid(p.proowner) AS function_owner,
  COALESCE(array_to_string(p.proacl, ', '), 'DEFAULT_GRANTS') AS function_acl,
  CASE
    WHEN p.oid = to_regprocedure('public.apply_stock_movement(uuid,text,integer,text,text,text,uuid,text,text)') THEN 'EXACT_MATCH'
    ELSE 'SIGNATURE_MISMATCH'
  END AS signature_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'apply_stock_movement';
