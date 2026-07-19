-- Read-only postflight: exactly one row and one overall gate.
SELECT
  -- precision_ok
  (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='credit_transactions' AND column_name='amount'
      AND numeric_precision=12 AND numeric_scale=2)
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='credit_transactions' AND column_name='balance_after'
      AND numeric_precision=12 AND numeric_scale=2)
  ) AS precision_ok,

  -- source_constraint_ok
  (
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.credit_transactions'::regclass
        AND c.conname='chk_credit_transactions_source_type' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') =
          'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_order''::text, ''manual''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))')
  ) AS source_constraint_ok,

  -- rpc_new_body_hash_ok
  (
    md5(regexp_replace(btrim((SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure), E' \t\n\r\f'), '\s+', ' ', 'g')) = '31b929d45764fd5c6d6144bdddb2b328'
  ) AS rpc_new_body_hash_ok,

  -- rpc_service_order_supported
  (
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure) LIKE '%service_order%'
  ) AS rpc_service_order_supported,

  -- rpc_manual_supported
  (
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure) LIKE '%manual%'
  ) AS rpc_manual_supported,

  -- purchase_service_order_supported
  (
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure) LIKE '%service_order%'
  ) AS purchase_service_order_supported,

  -- purchase_manual_supported
  (
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure) LIKE '%manual%'
  ) AS purchase_manual_supported,

  -- account_unique_index_ok
  (
    EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.uniq_credit_accounts_credit_customer_id')
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=1 AND i.indnkeyatts=1
        AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid='public.credit_accounts'::regclass AND attname='credit_customer_id' AND NOT attisdropped))
  ) AS account_unique_index_ok,

  -- reversal_unique_index_ok
  (
    EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.uniq_credit_transactions_reversed_once')
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indexprs IS NULL AND i.indpred IS NOT NULL AND i.indnatts=1 AND i.indnkeyatts=1
        AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid='public.credit_transactions'::regclass AND attname='reversed_transaction_id' AND NOT attisdropped)
        AND regexp_replace(pg_get_expr(i.indpred,i.indrelid,false),'\s+',' ','g') = '(reversed_transaction_id IS NOT NULL)')
  ) AS reversal_unique_index_ok,

  -- rpc_acl_ok
  (
    has_function_privilege('service_role', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    )
  ) AS rpc_acl_ok,

  -- table_acl_ok
  (
    has_table_privilege('service_role','public.credit_transactions','SELECT')
    AND NOT has_table_privilege('service_role','public.credit_transactions','INSERT,UPDATE,DELETE')
  ) AS table_acl_ok,

  -- sequence_acl_ok
  (
    NOT has_sequence_privilege('service_role','public.credit_transaction_code_seq','USAGE,SELECT,UPDATE')
    AND NOT has_sequence_privilege('service_role',to_regclass(pg_get_serial_sequence('public.credit_transactions','ledger_no')),'USAGE,SELECT,UPDATE')
  ) AS sequence_acl_ok,

  -- append_only_trigger_ok
  (
    EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.credit_transactions'::regclass AND NOT t.tgisinternal AND t.tgenabled IN('O','A') AND t.tgname='trg_prevent_credit_transactions_update_delete')
  ) AS append_only_trigger_ok,

  -- helper_security_ok
  (
    NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_credit_transactions_modification()'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.prevent_credit_transactions_modification()'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND NOT has_function_privilege('anon','public.prevent_credit_transactions_modification()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.prevent_credit_transactions_modification()','EXECUTE')
  ) AS helper_security_ok,

  -- rls_ok
  (
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.credit_transactions'::regclass)
  ) AS rls_ok,

  -- overall_ok
  (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='credit_transactions' AND column_name='amount'
      AND numeric_precision=12 AND numeric_scale=2)
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='credit_transactions' AND column_name='balance_after'
      AND numeric_precision=12 AND numeric_scale=2)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.credit_transactions'::regclass
        AND c.conname='chk_credit_transactions_source_type' AND c.convalidated
        AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g') =
          'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_order''::text, ''manual''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))')
    AND md5(regexp_replace(btrim((SELECT prosrc FROM pg_proc WHERE oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure), E' \t\n\r\f'), '\s+', ' ', 'g')) = '31b929d45764fd5c6d6144bdddb2b328'
    AND EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.uniq_credit_accounts_credit_customer_id')
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=1 AND i.indnkeyatts=1
        AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid='public.credit_accounts'::regclass AND attname='credit_customer_id' AND NOT attisdropped))
    AND EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.uniq_credit_transactions_reversed_once')
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indexprs IS NULL AND i.indpred IS NOT NULL AND i.indnatts=1 AND i.indnkeyatts=1
        AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid='public.credit_transactions'::regclass AND attname='reversed_transaction_id' AND NOT attisdropped)
        AND regexp_replace(pg_get_expr(i.indpred,i.indrelid,false),'\s+',' ','g') = '(reversed_transaction_id IS NOT NULL)')
    AND has_function_privilege('service_role', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    )
    AND has_table_privilege('service_role','public.credit_transactions','SELECT')
    AND NOT has_table_privilege('service_role','public.credit_transactions','INSERT,UPDATE,DELETE')
    AND NOT has_sequence_privilege('service_role','public.credit_transaction_code_seq','USAGE,SELECT,UPDATE')
    AND NOT has_sequence_privilege('service_role',to_regclass(pg_get_serial_sequence('public.credit_transactions','ledger_no')),'USAGE,SELECT,UPDATE')
    AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.credit_transactions'::regclass AND NOT t.tgisinternal AND t.tgenabled IN('O','A') AND t.tgname='trg_prevent_credit_transactions_update_delete')
    AND NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_credit_transactions_modification()'::regprocedure)
    AND EXISTS(SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c WHERE p.oid='public.prevent_credit_transactions_modification()'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp')
    AND NOT has_function_privilege('anon','public.prevent_credit_transactions_modification()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.prevent_credit_transactions_modification()','EXECUTE')
    AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.credit_transactions'::regclass)
  ) AS overall_ok;
