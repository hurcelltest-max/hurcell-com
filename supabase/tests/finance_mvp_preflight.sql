-- supabase/tests/finance_mvp_preflight.sql
-- Read-only preflight check for Finance MVP migration

SELECT
  (to_regclass('public.admin_users') IS NOT NULL AND
   to_regclass('public.products') IS NOT NULL AND
   to_regclass('public.orders') IS NOT NULL AND
   to_regclass('public.credit_customers') IS NOT NULL AND
   to_regclass('public.credit_accounts') IS NOT NULL AND
   to_regclass('public.credit_transactions') IS NOT NULL) AS baseline_tables_ok,
  
  (to_regclass('public.finance_plans') IS NULL AND
   to_regclass('public.finance_installments') IS NULL AND
   to_regclass('public.finance_collections') IS NULL AND
   to_regclass('public.finance_audit_logs') IS NULL) AS finance_tables_clean,

  NOT EXISTS (
    SELECT 1 FROM public.credit_accounts 
    WHERE current_balance < 0 OR current_balance > credit_limit
  ) AS balance_sanity_ok,

  EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'add_credit_transaction'
  ) AS credit_rpc_ok,

  ((to_regclass('public.admin_users') IS NOT NULL AND
    to_regclass('public.products') IS NOT NULL AND
    to_regclass('public.orders') IS NOT NULL AND
    to_regclass('public.credit_customers') IS NOT NULL AND
    to_regclass('public.credit_accounts') IS NOT NULL AND
    to_regclass('public.credit_transactions') IS NOT NULL)
   AND
   (to_regclass('public.finance_plans') IS NULL AND
    to_regclass('public.finance_installments') IS NULL AND
    to_regclass('public.finance_collections') IS NULL AND
    to_regclass('public.finance_audit_logs') IS NULL)
   AND
   NOT EXISTS (
     SELECT 1 FROM public.credit_accounts 
     WHERE current_balance < 0 OR current_balance > credit_limit
   )
   AND
   EXISTS (
     SELECT 1 FROM pg_proc WHERE proname = 'add_credit_transaction'
   )) AS overall_ok;
