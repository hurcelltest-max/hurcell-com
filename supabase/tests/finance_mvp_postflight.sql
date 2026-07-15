-- supabase/tests/finance_mvp_postflight.sql
-- Postflight validation check for Finance MVP migration

SELECT
  (to_regclass('public.finance_plans') IS NOT NULL AND
   to_regclass('public.finance_installments') IS NOT NULL AND
   to_regclass('public.finance_collections') IS NOT NULL AND
   to_regclass('public.finance_audit_logs') IS NOT NULL) AS finance_tables_ok,

  (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_finance_plan') AND
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_finance_collection') AND
   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_finance_plan')) AS finance_rpcs_ok,

  (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_plans') AND
  (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_installments') AND
  (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_collections') AND
  (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_audit_logs') AS rls_enabled_ok,

  -- ACLs Verification
  (has_function_privilege('public', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
   has_function_privilege('anon', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
   has_function_privilege('authenticated', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
   has_function_privilege('service_role', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = true) AS rpc_acls_ok,

  ((to_regclass('public.finance_plans') IS NOT NULL AND
    to_regclass('public.finance_installments') IS NOT NULL AND
    to_regclass('public.finance_collections') IS NOT NULL AND
    to_regclass('public.finance_audit_logs') IS NOT NULL)
   AND
   (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_finance_plan') AND
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_finance_collection') AND
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_finance_plan'))
   AND
   ((SELECT rowsecurity FROM pg_class WHERE relname = 'finance_plans') AND
    (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_installments') AND
    (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_collections') AND
    (SELECT rowsecurity FROM pg_class WHERE relname = 'finance_audit_logs'))
   AND
   (has_function_privilege('public', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
    has_function_privilege('service_role', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = true)) AS overall_ok;
