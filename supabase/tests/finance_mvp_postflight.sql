-- Read-only postflight: exactly one row and one overall gate.
SELECT
  -- tables_ok
  (
    to_regclass('public.finance_plans') IS NOT NULL
    AND to_regclass('public.finance_installments') IS NOT NULL
    AND to_regclass('public.finance_collections') IS NOT NULL
    AND to_regclass('public.finance_audit_logs') IS NOT NULL
    AND to_regclass('public.finance_receipt_seq') IS NOT NULL
  ) AS tables_ok,

  -- rpcs_ok
  (
    to_regprocedure('public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)') IS NOT NULL
    AND to_regprocedure('public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)') IS NOT NULL
    AND to_regprocedure('public.cancel_finance_plan(uuid,text,text)') IS NOT NULL
    AND to_regprocedure('public.prevent_finance_append_only_update_delete()') IS NOT NULL
  ) AS rpcs_ok,

  -- rls_ok
  (
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_plans' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_installments' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_collections' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_audit_logs' AND c.relrowsecurity)
  ) AS rls_ok,

  -- public_rpc_execute_false
  (
    NOT has_function_privilege('public', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
  ) AS public_rpc_execute_false,

  -- anon_rpc_execute_false
  (
    NOT has_function_privilege('anon', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
  ) AS anon_rpc_execute_false,

  -- authenticated_rpc_execute_false
  (
    NOT has_function_privilege('authenticated', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
  ) AS authenticated_rpc_execute_false,

  -- service_role_rpc_execute_true
  (
    has_function_privilege('service_role', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
  ) AS service_role_rpc_execute_true,

  -- table_select_only_ok
  (
    has_table_privilege('service_role','public.finance_plans','SELECT')
    AND has_table_privilege('service_role','public.finance_installments','SELECT')
    AND has_table_privilege('service_role','public.finance_collections','SELECT')
    AND has_table_privilege('service_role','public.finance_audit_logs','SELECT')
    AND NOT has_table_privilege('service_role','public.finance_plans','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_installments','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_collections','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_audit_logs','INSERT,UPDATE,DELETE')
  ) AS table_select_only_ok,

  -- sequence_acl_ok
  (
    NOT has_sequence_privilege('service_role','public.finance_receipt_seq','USAGE,SELECT,UPDATE')
  ) AS sequence_acl_ok,

  -- append_only_helpers_ok
  (
    NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_finance_append_only_update_delete()'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.prevent_finance_append_only_update_delete()'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND NOT has_function_privilege('anon','public.prevent_finance_append_only_update_delete()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.prevent_finance_append_only_update_delete()','EXECUTE')
  ) AS append_only_helpers_ok,

  -- collection_constraints_ok
  (
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_collections'::regclass
        AND c.conname='chk_reversal_ledger_transaction' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false), '\s+', ' ', 'g') IN (
          'CHECK (((collection_kind = ''down_payment''::text) AND (ledger_transaction_id IS NULL)) OR ((collection_kind = ANY (ARRAY[''installment_payment''::text, ''early_closure''::text])) AND (ledger_transaction_id IS NOT NULL)))',
          'CHECK ((((collection_kind = ''down_payment''::text) AND (ledger_transaction_id IS NULL)) OR ((collection_kind = ANY (ARRAY[''installment_payment''::text, ''early_closure''::text])) AND (ledger_transaction_id IS NOT NULL))))'
        ))
  ) AS collection_constraints_ok,

  -- plan_constraints_ok
  (
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_plans'::regclass AND c.conname='chk_financed_principal_calc')
  ) AS plan_constraints_ok,

  -- installment_constraints_ok
  (
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_components' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%amount_due = (principal_amount + finance_charge_amount)%')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_paid_not_over_due' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%amount_paid <= amount_due%')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_remaining' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%status = %cancelled%')
  ) AS installment_constraints_ok,

  -- unique_source_ok
  (
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_plans'::regclass
        AND c.conname='uniq_finance_plans_source' AND c.contype='u')
  ) AS unique_source_ok,

  -- rpc_security_definer_ok
  (
    (SELECT prosecdef FROM pg_proc WHERE oid='public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'::regprocedure)
    AND (SELECT prosecdef FROM pg_proc WHERE oid='public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'::regprocedure)
    AND (SELECT prosecdef FROM pg_proc WHERE oid='public.cancel_finance_plan(uuid,text,text)'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.cancel_finance_plan(uuid,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND NOT has_function_privilege('public', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
  ) AS rpc_security_definer_ok,

  -- overall_ok
  (
    -- Combine all fields
    to_regclass('public.finance_plans') IS NOT NULL
    AND to_regclass('public.finance_installments') IS NOT NULL
    AND to_regclass('public.finance_collections') IS NOT NULL
    AND to_regclass('public.finance_audit_logs') IS NOT NULL
    AND to_regclass('public.finance_receipt_seq') IS NOT NULL
    AND to_regprocedure('public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)') IS NOT NULL
    AND to_regprocedure('public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)') IS NOT NULL
    AND to_regprocedure('public.cancel_finance_plan(uuid,text,text)') IS NOT NULL
    AND to_regprocedure('public.prevent_finance_append_only_update_delete()') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_plans' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_installments' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_collections' AND c.relrowsecurity)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'finance_audit_logs' AND c.relrowsecurity)
    AND NOT has_function_privilege('public', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('public', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('anon', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND NOT has_function_privilege('authenticated', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)', 'execute')
    AND has_function_privilege('service_role', 'public.cancel_finance_plan(uuid,text,text)', 'execute')
    AND has_table_privilege('service_role','public.finance_plans','SELECT')
    AND has_table_privilege('service_role','public.finance_installments','SELECT')
    AND has_table_privilege('service_role','public.finance_collections','SELECT')
    AND has_table_privilege('service_role','public.finance_audit_logs','SELECT')
    AND NOT has_table_privilege('service_role','public.finance_plans','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_installments','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_collections','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','public.finance_audit_logs','INSERT,UPDATE,DELETE')
    AND NOT has_sequence_privilege('service_role','public.finance_receipt_seq','USAGE,SELECT,UPDATE')
    AND NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_finance_append_only_update_delete()'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.prevent_finance_append_only_update_delete()'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND NOT has_function_privilege('anon','public.prevent_finance_append_only_update_delete()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.prevent_finance_append_only_update_delete()','EXECUTE')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_collections'::regclass
        AND c.conname='chk_reversal_ledger_transaction' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false), '\s+', ' ', 'g') IN (
          'CHECK (((collection_kind = ''down_payment''::text) AND (ledger_transaction_id IS NULL)) OR ((collection_kind = ANY (ARRAY[''installment_payment''::text, ''early_closure''::text])) AND (ledger_transaction_id IS NOT NULL)))',
          'CHECK ((((collection_kind = ''down_payment''::text) AND (ledger_transaction_id IS NULL)) OR ((collection_kind = ANY (ARRAY[''installment_payment''::text, ''early_closure''::text])) AND (ledger_transaction_id IS NOT NULL))))'
        ))
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_plans'::regclass AND c.conname='chk_financed_principal_calc')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_components' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%amount_due = (principal_amount + finance_charge_amount)%')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_paid_not_over_due' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%amount_paid <= amount_due%')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_installments'::regclass
        AND c.conname='chk_finance_installment_remaining' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') LIKE '%status = %cancelled%')
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conrelid='public.finance_plans'::regclass
        AND c.conname='uniq_finance_plans_source' AND c.contype='u')
    -- SECURITY DEFINER checks
    AND (SELECT prosecdef FROM pg_proc WHERE oid='public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'::regprocedure)
    AND (SELECT prosecdef FROM pg_proc WHERE oid='public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'::regprocedure)
    AND (SELECT prosecdef FROM pg_proc WHERE oid='public.cancel_finance_plan(uuid,text,text)'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.cancel_finance_plan(uuid,text,text)'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
  ) AS overall_ok;
