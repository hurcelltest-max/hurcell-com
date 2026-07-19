-- CLONE ONLY — DO NOT RUN ON LIVE PRODUCTION.
-- This test invokes nextval() on existing Ledger sequences.
-- Transaction rollback does not restore consumed sequence values.

BEGIN;

CREATE TEMP TABLE ledger_before_fingerprint AS
SELECT count(*)::bigint AS row_count,
       coalesce(sum(amount),0)::numeric AS amount_sum,
       coalesce(sum(balance_after),0)::numeric AS balance_after_sum,
       min(ledger_no)::bigint AS min_ledger_no,
       max(ledger_no)::bigint AS max_ledger_no,
       md5(coalesce(string_agg(md5(concat_ws('|',id::text,ledger_no::text,
         amount::text,balance_after::text,credit_account_id::text)),
         '' ORDER BY ledger_no,id),'')) AS aggregate_hash
FROM public.credit_transactions;
SAVEPOINT before_ledger_migration;

-- EXACT LEDGER MIGRATION BODY START
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Finance readiness for the existing append-only credit ledger.
DO $$
DECLARE
  v_amount_type regtype;
  v_balance_type regtype;
BEGIN
  SELECT atttypid::regtype INTO v_amount_type
  FROM pg_attribute
  WHERE attrelid = 'public.credit_transactions'::regclass
    AND attname = 'amount' AND attnum > 0 AND NOT attisdropped;
  SELECT atttypid::regtype INTO v_balance_type
  FROM pg_attribute
  WHERE attrelid = 'public.credit_transactions'::regclass
    AND attname = 'balance_after' AND attnum > 0 AND NOT attisdropped;

  IF v_amount_type IS DISTINCT FROM 'numeric'::regtype
     OR v_balance_type IS DISTINCT FROM 'numeric'::regtype THEN
    RAISE EXCEPTION 'credit_transactions amount/balance_after must both be numeric';
  END IF;
END;
$$;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(column_name||'='||coalesce(numeric_precision::text,'?')||','||coalesce(numeric_scale::text,'?'),';') INTO v_bad
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='credit_transactions'
    AND column_name IN ('amount','balance_after')
    AND NOT (data_type='numeric' AND numeric_scale=2 AND numeric_precision IN (10,12));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Unexpected ledger numeric definition: %',v_bad; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_transactions'
      AND column_name IN ('amount','balance_after'))<>2 THEN RAISE EXCEPTION 'Ledger numeric columns missing'; END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.credit_transactions'::regclass
      AND attgenerated<>'' AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'Generated-column dependency requires manual review'; END IF;
  IF EXISTS (SELECT 1 FROM pg_index WHERE indrelid='public.credit_transactions'::regclass
      AND indexprs IS NOT NULL) THEN RAISE EXCEPTION 'Expression-index dependency requires manual review'; END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
      JOIN pg_class v ON v.oid=r.ev_class WHERE d.refobjid='public.credit_transactions'::regclass
      AND d.refobjsubid IN ((SELECT attnum FROM pg_attribute WHERE attrelid=d.refobjid AND attname='amount'),
                           (SELECT attnum FROM pg_attribute WHERE attrelid=d.refobjid AND attname='balance_after'))
      AND v.relkind IN ('v','m')) THEN RAISE EXCEPTION 'View dependency requires manual review'; END IF;
END $$;

ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE NUMERIC(12,2)
    USING amount::NUMERIC(12,2),
  ALTER COLUMN balance_after TYPE NUMERIC(12,2)
    USING balance_after::NUMERIC(12,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_accounts
    GROUP BY credit_customer_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate credit accounts exist for at least one customer';
  END IF;
END;
$$;

DO $$
DECLARE v_bad boolean;
BEGIN
  IF to_regclass('public.uniq_credit_accounts_credit_customer_id') IS NULL THEN
    CREATE UNIQUE INDEX uniq_credit_accounts_credit_customer_id
      ON public.credit_accounts(credit_customer_id);
  ELSE
    SELECT NOT (
      i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
      AND i.indnatts = 1 AND i.indnkeyatts = 1
      AND i.indexprs IS NULL AND i.indpred IS NULL
      AND i.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.credit_accounts'::regclass
          AND attname = 'credit_customer_id' AND NOT attisdropped
      )
    ) INTO v_bad
    FROM pg_index i
    WHERE i.indexrelid='public.uniq_credit_accounts_credit_customer_id'::regclass;
    IF coalesce(v_bad,true) THEN
      RAISE EXCEPTION 'Existing uniq_credit_accounts_credit_customer_id index definition is unexpected';
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  v_def text;
  v_validated boolean;
  v_expected constant text :=
    'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))';
BEGIN
  SELECT pg_get_constraintdef(oid,false), convalidated
    INTO v_def, v_validated
  FROM pg_constraint
  WHERE conrelid='public.credit_transactions'::regclass
    AND conname='chk_credit_transactions_source_type' AND contype='c';
  IF v_def IS NULL THEN RAISE EXCEPTION 'Expected source_type constraint is missing'; END IF;
  IF NOT v_validated THEN
    RAISE EXCEPTION 'Expected source_type constraint is NOT VALID';
  END IF;
  IF regexp_replace(v_def,'\s+',' ','g') IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Unexpected source_type constraint definition: %',v_def;
  END IF;
END $$;
ALTER TABLE public.credit_transactions DROP CONSTRAINT chk_credit_transactions_source_type;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT chk_credit_transactions_source_type CHECK (
    source_type IN (
      'web_order', 'store_sale', 'service_order', 'manual',
      'service_fee', 'print_fee', 'technical_service_fee',
      'payment', 'adjustment', 'reversal'
    )
  );

-- Guard the verified production RPC contract before replacing its body.
DO $$
DECLARE
  v_oid oid := to_regprocedure(
    'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)');
  v_actual_hash text;
  -- md5(regexp_replace(btrim(<20260709160000 prosrc>), '\s+', ' ', 'g'))
  -- Target production function body is semantically identical to the
  -- repository-tracked legacy function. The production variant only adds
  -- number prefixes to eleven SQL line comments. The production database's
  -- exact normalized MD5 is therefore used as the migration precondition.
  v_expected_hash constant text := 'b7620bc75905ac461f37ab32fc0b430e';
BEGIN
  IF v_oid IS NULL OR pg_get_function_result(v_oid) <> 'jsonb' THEN
    RAISE EXCEPTION 'Unexpected add_credit_transaction signature or return type';
  END IF;
  SELECT md5(regexp_replace(btrim(p.prosrc), '\s+', ' ', 'g'))
    INTO v_actual_hash
  FROM pg_proc p
  WHERE p.oid = v_oid;
  IF v_actual_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION
      'Production add_credit_transaction body fingerprint mismatch (expected %, actual %)',
      v_expected_hash, coalesce(v_actual_hash, '<null>');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_credit_transaction(
    p_customer_id UUID,
    p_account_id UUID,
    p_transaction_type TEXT,
    p_direction TEXT,
    p_amount NUMERIC,
    p_description TEXT,
    p_source_type TEXT,
    p_source_reference TEXT,
    p_external_url TEXT,
    p_payment_method TEXT,
    p_admin_username TEXT,
    p_reversed_transaction_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_status TEXT;
    v_account_status TEXT;
    v_credit_limit NUMERIC;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_transaction_code TEXT;
    v_inserted_id UUID;
    v_ledger_no BIGINT;
    v_original_trx RECORD;
BEGIN
    -- Veri Temizliği (Trim)
    p_description := trim(p_description);
    p_admin_username := trim(p_admin_username);
    p_source_reference := trim(p_source_reference);
    p_payment_method := trim(p_payment_method);
    p_transaction_type := trim(p_transaction_type);
    p_direction := trim(p_direction);
    p_source_type := trim(p_source_type);

    -- Temel Validasyonlar, Miktar Hassasiyeti ve NULL Kontrolleri
    IF p_amount IS NULL THEN RAISE EXCEPTION 'Amount is required'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
    IF p_amount != round(p_amount, 2) THEN RAISE EXCEPTION 'Amount can have at most 2 decimal places'; END IF;
    
    IF p_admin_username IS NULL OR p_admin_username = '' THEN RAISE EXCEPTION 'Admin username is required'; END IF;
    IF p_description IS NULL OR p_description = '' THEN RAISE EXCEPTION 'Description is required'; END IF;
    
    IF p_transaction_type IS NULL OR p_transaction_type = '' THEN RAISE EXCEPTION 'Transaction type is required'; END IF;
    IF p_direction IS NULL OR p_direction = '' THEN RAISE EXCEPTION 'Direction is required'; END IF;
    IF p_source_type IS NULL OR p_source_type = '' THEN RAISE EXCEPTION 'Source type is required'; END IF;

    -- Enum ve Allowlist RPC İçi Kontrolleri
    IF p_transaction_type NOT IN ('purchase', 'fee', 'payment', 'adjustment', 'reversal') THEN RAISE EXCEPTION 'Invalid transaction_type'; END IF;
    IF p_direction NOT IN ('debit', 'credit') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
    IF p_source_type NOT IN (
        'web_order',
        'store_sale',
        'service_order',
        'manual',
        'service_fee',
        'print_fee',
        'technical_service_fee',
        'payment',
        'adjustment',
        'reversal'
    ) THEN
        RAISE EXCEPTION 'Invalid source_type';
    END IF;

    -- Yön/Tip ve Kaynak Uyumluluğu Enforce
    IF p_transaction_type = 'payment' THEN
        IF p_direction != 'credit' OR p_source_type != 'payment' THEN RAISE EXCEPTION 'Payment transactions must be credit direction and payment source_type'; END IF;
        IF p_payment_method IS NULL OR p_payment_method = '' THEN RAISE EXCEPTION 'Payment method is required for payments'; END IF;
        IF p_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'other') THEN RAISE EXCEPTION 'Invalid payment_method'; END IF;
    ELSE
        p_payment_method := NULL;
    END IF;

    IF p_transaction_type = 'purchase' THEN
        IF p_direction != 'debit' THEN
            RAISE EXCEPTION 'Purchase transactions must be debit direction';
        END IF;

        IF p_source_type NOT IN (
            'web_order',
            'store_sale',
            'service_order',
            'manual'
        ) THEN
            RAISE EXCEPTION
              'Purchase source_type must be web_order, store_sale, service_order, or manual';
        END IF;
    END IF;

    IF p_transaction_type = 'fee' THEN
        IF p_direction != 'debit' THEN RAISE EXCEPTION 'Fee transactions must be debit direction'; END IF;
        IF p_source_type NOT IN ('service_fee', 'print_fee', 'technical_service_fee') THEN RAISE EXCEPTION 'Invalid source_type for fee'; END IF;
    END IF;

    IF p_source_type = 'technical_service_fee' AND (p_source_reference IS NULL OR p_source_reference = '') THEN
        RAISE EXCEPTION 'Source reference is required for technical_service_fee';
    END IF;

    IF p_transaction_type = 'adjustment' THEN
        IF p_source_type != 'adjustment' THEN RAISE EXCEPTION 'Adjustment transactions must have adjustment source_type'; END IF;
    END IF;

    IF p_transaction_type = 'reversal' THEN
        IF p_reversed_transaction_id IS NULL THEN RAISE EXCEPTION 'Reversed transaction ID is required for reversals'; END IF;
        IF p_source_type != 'reversal' THEN RAISE EXCEPTION 'Reversal transactions must have reversal source_type'; END IF;
    END IF;

    IF p_transaction_type <> 'reversal' AND p_reversed_transaction_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only reversal transactions can reference reversed_transaction_id';
    END IF;

    -- Müşteri ve Hesabı Kilitle (FOR UPDATE)
    SELECT c.status, a.status, a.credit_limit, a.current_balance 
    INTO v_customer_status, v_account_status, v_credit_limit, v_current_balance
    FROM public.credit_customers c
    JOIN public.credit_accounts a ON a.credit_customer_id = c.id
    WHERE c.id = p_customer_id AND a.id = p_account_id 
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Customer or Account not found or mismatch'; END IF;
    IF v_customer_status != 'active' OR v_account_status != 'active' THEN RAISE EXCEPTION 'Customer and Account must be active'; END IF;
    IF v_credit_limit IS NULL OR v_current_balance IS NULL THEN RAISE EXCEPTION 'Credit account balance/limit is invalid'; END IF;

    -- Reversal Detay Validasyonu (Orijinal Satır Kilidi ile)
    IF p_transaction_type = 'reversal' THEN
        SELECT * INTO v_original_trx FROM public.credit_transactions WHERE id = p_reversed_transaction_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Original transaction not found'; END IF;
        IF v_original_trx.transaction_type = 'reversal' THEN RAISE EXCEPTION 'Reversal transactions cannot be reversed'; END IF;
        IF v_original_trx.credit_account_id != p_account_id THEN RAISE EXCEPTION 'Original transaction belongs to a different account'; END IF;
        IF v_original_trx.amount != p_amount THEN RAISE EXCEPTION 'Reversal amount must match original amount'; END IF;
        
        IF v_original_trx.direction = 'debit' AND p_direction != 'credit' THEN RAISE EXCEPTION 'Reversal direction must inverse original (debit -> credit)'; END IF;
        IF v_original_trx.direction = 'credit' AND p_direction != 'debit' THEN RAISE EXCEPTION 'Reversal direction must inverse original (credit -> debit)'; END IF;
        
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE reversed_transaction_id = p_reversed_transaction_id) THEN
            RAISE EXCEPTION 'Transaction is already reversed';
        END IF;
    END IF;

    -- Bakiye Hesaplama, Limit ve Fazla Tahsilat Kontrolü
    IF p_direction = 'debit' THEN
        v_new_balance := v_current_balance + p_amount;
        IF v_new_balance > v_credit_limit THEN RAISE EXCEPTION 'Insufficient credit limit'; END IF;
    ELSIF p_direction = 'credit' THEN
        v_new_balance := v_current_balance - p_amount;
        IF v_new_balance < 0 THEN RAISE EXCEPTION 'Overpayment is not allowed (current balance cannot drop below 0)'; END IF;
    ELSE
        RAISE EXCEPTION 'Invalid direction';
    END IF;

    -- Sequence Tabanlı Transaction Code
    v_transaction_code := 'TRX-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

    -- Insert Transaction
    INSERT INTO public.credit_transactions (
        transaction_code, credit_customer_id, credit_account_id,
        transaction_type, direction, amount, description, source_type,
        source_reference, external_url, payment_method, admin_username,
        reversed_transaction_id, balance_after, metadata
    ) VALUES (
        v_transaction_code, p_customer_id, p_account_id,
        p_transaction_type, p_direction, p_amount, p_description, p_source_type,
        p_source_reference, p_external_url, p_payment_method, p_admin_username,
        p_reversed_transaction_id, v_new_balance, p_metadata
    ) RETURNING id, ledger_no INTO v_inserted_id, v_ledger_no;

    -- Hesabı Güncelle
    UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = p_account_id;

    -- Audit Log (Detaylı old_value ve new_value)
    INSERT INTO public.credit_audit_logs (
        credit_customer_id, credit_account_id, admin_username, action_type, reason, old_value, new_value
    ) VALUES (
        p_customer_id, p_account_id, p_admin_username, 'credit_transaction_added', p_description,
        jsonb_build_object(
            'old_balance', v_current_balance,
            'credit_limit', v_credit_limit,
            'account_status', v_account_status
        ),
        jsonb_build_object(
            'transaction_id', v_inserted_id,
            'transaction_code', v_transaction_code,
            'ledger_no', v_ledger_no,
            'direction', p_direction,
            'amount', p_amount,
            'source_type', p_source_type,
            'payment_method', p_payment_method,
            'old_balance', v_current_balance,
            'new_balance', v_new_balance,
            'balance_after', v_new_balance,
            'reversed_transaction_id', p_reversed_transaction_id
        )
    );

    RETURN jsonb_build_object(
        'success', true, 
        'transaction_id', v_inserted_id, 
        'transaction_code', v_transaction_code, 
        'ledger_no', v_ledger_no, 
        'new_balance', v_new_balance
    );
END;
$$;
REVOKE ALL ON FUNCTION public.add_credit_transaction(UUID,UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_credit_transaction(UUID,UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_credit_transactions_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'credit_transactions records are append-only and cannot be modified or deleted. Use reversal or adjustment instead.';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_credit_transactions_modification()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_credit_transactions_modification()
  TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_credit_transactions_update_delete
  ON public.credit_transactions;
CREATE TRIGGER trg_prevent_credit_transactions_update_delete
BEFORE UPDATE OR DELETE ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_transactions_modification();
ALTER TABLE public.credit_transactions
  ENABLE TRIGGER trg_prevent_credit_transactions_update_delete;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.credit_transactions FROM service_role;
GRANT SELECT ON TABLE public.credit_transactions TO service_role;

REVOKE ALL ON SEQUENCE public.credit_transaction_code_seq
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_ledger_seq regclass := to_regclass(
    pg_get_serial_sequence('public.credit_transactions', 'ledger_no')
  );
BEGIN
  IF v_ledger_seq IS NULL THEN
    RAISE EXCEPTION 'Serial sequence for credit_transactions.ledger_no is missing';
  END IF;
  EXECUTE format(
    'REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role', v_ledger_seq
  );
END;
$$;

DO $$
DECLARE v_bad boolean;
BEGIN
  IF to_regclass('public.uniq_credit_transactions_reversed_once') IS NULL THEN
    CREATE UNIQUE INDEX uniq_credit_transactions_reversed_once
      ON public.credit_transactions(reversed_transaction_id)
      WHERE reversed_transaction_id IS NOT NULL;
  ELSE
    SELECT NOT (
      i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
      AND i.indnatts = 1 AND i.indnkeyatts = 1
      AND i.indexprs IS NULL AND i.indpred IS NOT NULL
      AND i.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid='public.credit_transactions'::regclass
          AND attname='reversed_transaction_id' AND NOT attisdropped
      )
      AND regexp_replace(pg_get_expr(i.indpred,i.indrelid,false),'\s+',' ','g')
          = '(reversed_transaction_id IS NOT NULL)'
    ) INTO v_bad
    FROM pg_index i
    WHERE i.indexrelid='public.uniq_credit_transactions_reversed_once'::regclass;
    IF coalesce(v_bad,true) THEN
      RAISE EXCEPTION 'Existing uniq_credit_transactions_reversed_once index definition is unexpected';
    END IF;
  END IF;
END $$;
-- EXACT LEDGER MIGRATION BODY END

DO $$
DECLARE
  v_id uuid; v_account uuid; v_other_customer uuid; v_other_account uuid;
  v_service_tx uuid; v_manual_tx uuid;
  v_phone text := '+90'||substr(replace(gen_random_uuid()::text,'-',''),1,10);
BEGIN
  IF (SELECT row_count FROM ledger_before_fingerprint) IS DISTINCT FROM (SELECT count(*) FROM public.credit_transactions)
     OR (SELECT amount_sum FROM ledger_before_fingerprint) IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM public.credit_transactions)
     OR (SELECT balance_after_sum FROM ledger_before_fingerprint) IS DISTINCT FROM (SELECT coalesce(sum(balance_after),0) FROM public.credit_transactions)
     OR (SELECT aggregate_hash FROM ledger_before_fingerprint) IS DISTINCT FROM
       (SELECT md5(coalesce(string_agg(md5(concat_ws('|',id::text,ledger_no::text,
          amount::text,balance_after::text,credit_account_id::text)),
          '' ORDER BY ledger_no,id),'')) FROM public.credit_transactions)
  THEN RAISE EXCEPTION 'Ledger fingerprint changed before synthetic tests'; END IF;
  v_id:=gen_random_uuid(); v_account:=gen_random_uuid();
  INSERT INTO public.credit_customers(id,full_name,phone,phone_normalized,status)
  VALUES(v_id,'DRY-RUN LEDGER SYNTHETIC',v_phone,v_phone,'active');
  INSERT INTO public.credit_accounts(id,credit_customer_id,credit_limit,current_balance,statement_day,status)
  VALUES(v_account,v_id,1000,0,15,'active');
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_transactions' AND column_name='amount' AND numeric_precision=12 AND numeric_scale=2) THEN RAISE EXCEPTION 'T1 amount precision'; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_transactions' AND column_name='balance_after' AND numeric_precision=12 AND numeric_scale=2) THEN RAISE EXCEPTION 'T2 balance precision'; END IF;
  IF EXISTS(SELECT 1 FROM public.credit_accounts GROUP BY credit_customer_id HAVING count(*)>1) THEN RAISE EXCEPTION 'T5 duplicates'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_credit_accounts_credit_customer_id') THEN RAISE EXCEPTION 'T4 unique'; END IF;
  IF to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'T8 signature'; END IF;
  IF pg_get_function_result(to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'))<>'jsonb' THEN RAISE EXCEPTION 'T9 result'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)')) THEN RAISE EXCEPTION 'T10 definer'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL unnest(p.proconfig) c WHERE p.oid=to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)') AND replace(c,' ','')='search_path=public,pg_temp') THEN RAISE EXCEPTION 'T11 search path'; END IF;
  IF has_function_privilege('anon',to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'),'EXECUTE') OR has_function_privilege('authenticated',to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'),'EXECUTE') OR NOT has_function_privilege('service_role',to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'),'EXECUTE') THEN RAISE EXCEPTION 'T12-15 RPC ACL'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)') AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'T12 PUBLIC RPC ACL'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.credit_transactions'::regclass AND NOT t.tgisinternal AND t.tgenabled IN('O','A')) THEN RAISE EXCEPTION 'T16 trigger'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.prevent_credit_transactions_modification()'::regprocedure) THEN RAISE EXCEPTION 'T17 invoker'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL unnest(p.proconfig) c WHERE p.oid='public.prevent_credit_transactions_modification()'::regprocedure AND replace(c,' ','')='search_path=public,pg_temp') THEN RAISE EXCEPTION 'T18 helper search path'; END IF;
  IF has_function_privilege('anon','public.prevent_credit_transactions_modification()','EXECUTE') OR has_function_privilege('authenticated','public.prevent_credit_transactions_modification()','EXECUTE') THEN RAISE EXCEPTION 'T19 helper ACL'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.credit_transactions'::regclass) THEN RAISE EXCEPTION 'T20 RLS'; END IF;
  IF NOT has_table_privilege('service_role','public.credit_transactions','SELECT') OR has_table_privilege('service_role','public.credit_transactions','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'T21 table ACL'; END IF;
  IF has_sequence_privilege('service_role','public.credit_transaction_code_seq','USAGE,SELECT') THEN RAISE EXCEPTION 'T22 code sequence'; END IF;
  IF has_sequence_privilege('service_role',to_regclass(pg_get_serial_sequence('public.credit_transactions','ledger_no')),'USAGE,SELECT') THEN RAISE EXCEPTION 'T23 ledger sequence'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='credit_transactions' AND indexdef ILIKE 'CREATE UNIQUE INDEX%reversed_transaction_id%WHERE%IS NOT NULL%') THEN RAISE EXCEPTION 'T24 reversal index'; END IF;
  v_service_tx:=((public.add_credit_transaction(v_id,v_account,'purchase','debit',10,'service test','service_order','dry-svc',NULL,NULL,'dry_run',NULL,NULL))->>'transaction_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.credit_transactions WHERE id=v_service_tx AND source_type='service_order') THEN RAISE EXCEPTION 'T6 service_order'; END IF;
  PERFORM public.add_credit_transaction(v_id,v_account,'reversal','credit',10,'service reverse','reversal','dry-svc',NULL,NULL,'dry_run',v_service_tx,NULL);
  v_manual_tx:=((public.add_credit_transaction(v_id,v_account,'purchase','debit',10,'manual test','manual','dry-manual',NULL,NULL,'dry_run',NULL,NULL))->>'transaction_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.credit_transactions WHERE id=v_manual_tx AND source_type='manual') THEN RAISE EXCEPTION 'T7 manual'; END IF;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,NULL,'debit',1,'null type','manual','n1',NULL,NULL,'dry_run',NULL,NULL); RAISE EXCEPTION 'NULL transaction type accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Transaction type is required' THEN RAISE; END IF; END;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'purchase',NULL,1,'null direction','manual','n2',NULL,NULL,'dry_run',NULL,NULL); RAISE EXCEPTION 'NULL direction accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Direction is required' THEN RAISE; END IF; END;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'purchase','debit',1,'null source',NULL,'n3',NULL,NULL,'dry_run',NULL,NULL); RAISE EXCEPTION 'NULL source accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Source type is required' THEN RAISE; END IF; END;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'payment','credit',1,'null method','payment','n4',NULL,NULL,'dry_run',NULL,NULL); RAISE EXCEPTION 'NULL payment method accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Payment method is required for payments' THEN RAISE; END IF; END;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'payment','credit',1,'empty method','payment','n5',NULL,'','dry_run',NULL,NULL); RAISE EXCEPTION 'Empty payment method accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Payment method is required for payments' THEN RAISE; END IF; END;
  v_other_customer:=gen_random_uuid(); v_other_account:=gen_random_uuid();
  v_phone:='+90'||substr(replace(gen_random_uuid()::text,'-',''),1,10);
  INSERT INTO public.credit_customers(id,full_name,phone,phone_normalized,status) VALUES(v_other_customer,'DRY-RUN OTHER',v_phone,v_phone,'active');
  INSERT INTO public.credit_accounts(id,credit_customer_id,credit_limit,current_balance,statement_day,status) VALUES(v_other_account,v_other_customer,1000,0,15,'active');
  BEGIN PERFORM public.add_credit_transaction(v_other_customer,v_other_account,'reversal','credit',10,'wrong account','reversal','r1',NULL,NULL,'dry_run',v_manual_tx,NULL); RAISE EXCEPTION 'Invalid reversal account accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Original transaction belongs to a different account' THEN RAISE; END IF; END;
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'reversal','credit',9,'wrong amount','reversal','r2',NULL,NULL,'dry_run',v_manual_tx,NULL); RAISE EXCEPTION 'Invalid reversal amount accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Reversal amount must match original amount' THEN RAISE; END IF; END;
  PERFORM public.add_credit_transaction(v_id,v_account,'reversal','credit',10,'manual reverse','reversal','r3',NULL,NULL,'dry_run',v_manual_tx,NULL);
  BEGIN PERFORM public.add_credit_transaction(v_id,v_account,'reversal','credit',10,'second reverse','reversal','r4',NULL,NULL,'dry_run',v_manual_tx,NULL); RAISE EXCEPTION 'Second reversal accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Transaction is already reversed' THEN RAISE; END IF; END;
  BEGIN UPDATE public.credit_transactions SET amount=amount WHERE id=v_manual_tx; RAISE EXCEPTION 'T25 update was not rejected'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='T25 update was not rejected' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.credit_transactions WHERE id=v_manual_tx; RAISE EXCEPTION 'T26 delete was not rejected'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='T26 delete was not rejected' THEN RAISE; END IF; END;
END $$;
SELECT 34 AS pass_count, 0 AS fail_count, 34 AS expected_test_count,
       34 AS actual_test_count, 'PENDING'::text AS rollback_cleanup_status;
ROLLBACK TO SAVEPOINT before_ledger_migration;
WITH cleanup AS (SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_transactions' AND column_name='amount' AND numeric_precision=10 AND numeric_scale=2) AS precision_rolled_back,
  EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.credit_transactions'::regclass
    AND c.conname='chk_credit_transactions_source_type' AND c.convalidated
    AND regexp_replace(pg_get_constraintdef(c.oid,false),'\s+',' ','g')=
      'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))') AS source_constraint_rolled_back,
  NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_credit_accounts_credit_customer_id') AS unique_index_rolled_back,
  (SELECT proconfig IS NULL FROM pg_proc WHERE oid='public.prevent_credit_transactions_modification()'::regprocedure) AS helper_config_rolled_back,
  (SELECT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM pg_proc p WHERE p.oid='public.prevent_credit_transactions_modification()'::regprocedure) AS helper_public_acl_rolled_back,
  md5(regexp_replace(btrim((SELECT prosrc FROM pg_proc WHERE oid =
    'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)'::regprocedure)), '\s+', ' ', 'g'))
    = 'b7620bc75905ac461f37ab32fc0b430e' AS rpc_body_rolled_back,
  has_function_privilege('service_role','public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)','EXECUTE')
    AND NOT has_function_privilege('anon','public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)','EXECUTE') AS rpc_acl_rolled_back,
  (SELECT aggregate_hash FROM ledger_before_fingerprint) =
    (SELECT md5(coalesce(string_agg(md5(concat_ws('|',id::text,ledger_no::text,
      amount::text,balance_after::text,credit_account_id::text)),
      '' ORDER BY ledger_no,id),'')) FROM public.credit_transactions) AS ledger_fingerprint_rolled_back
)
SELECT cleanup.*,
  (precision_rolled_back AND source_constraint_rolled_back AND unique_index_rolled_back
   AND helper_config_rolled_back AND helper_public_acl_rolled_back
   AND rpc_body_rolled_back AND rpc_acl_rolled_back AND ledger_fingerprint_rolled_back)
  AS overall_cleanup_ok,
  CASE WHEN (precision_rolled_back AND source_constraint_rolled_back AND unique_index_rolled_back
   AND helper_config_rolled_back AND helper_public_acl_rolled_back
   AND rpc_body_rolled_back AND rpc_acl_rolled_back AND ledger_fingerprint_rolled_back)
   THEN 'PASS' ELSE 'FAIL' END AS cleanup_result
FROM cleanup;
ROLLBACK;
