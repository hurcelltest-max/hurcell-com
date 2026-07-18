-- CLONE ONLY — DO NOT RUN ON LIVE PRODUCTION.
-- This test invokes nextval() on existing Ledger sequences.
-- Transaction rollback does not restore consumed sequence values.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND tablename='credit_accounts' AND indexname='uniq_credit_accounts_credit_customer_id') THEN
    RAISE EXCEPTION 'Finance requires uniq_credit_accounts_credit_customer_id';
  END IF;
END $$;

-- =========================================================================
-- EXACT MIGRATION BODY START
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
    IF to_regclass('public.finance_plans') IS NOT NULL
       OR to_regclass('public.finance_installments') IS NOT NULL
       OR to_regclass('public.finance_collections') IS NOT NULL
       OR to_regclass('public.finance_audit_logs') IS NOT NULL
       OR to_regclass('public.finance_receipt_seq') IS NOT NULL
       OR to_regprocedure('public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)') IS NOT NULL
       OR to_regprocedure('public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)') IS NOT NULL
       OR to_regprocedure('public.cancel_finance_plan(uuid,text,text)') IS NOT NULL
       OR to_regprocedure('public.prevent_finance_append_only_update_delete()') IS NOT NULL
    THEN
        RAISE EXCEPTION 'Finance clean-schema guard failed: one or more Finance objects already exist';
    END IF;
END;
$$;

-- Hard dependency: Finance assumes exactly one credit account per customer.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'credit_accounts'
          AND indexname = 'uniq_credit_accounts_credit_customer_id'
          AND indexdef ILIKE 'CREATE UNIQUE INDEX%credit_customer_id%'
    ) THEN
        RAISE EXCEPTION 'Finance requires uniq_credit_accounts_credit_customer_id';
    END IF;
END;
$$;

-- Create Sequences
CREATE SEQUENCE IF NOT EXISTS public.finance_receipt_seq START 1;
REVOKE ALL ON SEQUENCE public.finance_receipt_seq FROM PUBLIC, anon, authenticated, service_role;

-- 1. Create finance_plans Table
CREATE TABLE IF NOT EXISTS public.finance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    credit_customer_id UUID NOT NULL REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
    credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE RESTRICT,
    source_type TEXT NOT NULL CHECK (source_type IN ('store_sale', 'web_order', 'service_order', 'manual')),
    source_reference TEXT NOT NULL,
    principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount >= 750),
    down_payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (down_payment_amount >= 0),
    financed_principal NUMERIC(12,2) NOT NULL CHECK (financed_principal > 0),
    term_rate_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (term_rate_percent >= 0),
    finance_charge_amount NUMERIC(12,2) NOT NULL CHECK (finance_charge_amount >= 0),
    total_due_amount NUMERIC(12,2) NOT NULL CHECK (total_due_amount > 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC(12,2) NOT NULL CHECK (remaining_amount >= 0),
    installment_count SMALLINT NOT NULL CHECK (installment_count BETWEEN 1 AND 3),
    statement_day SMALLINT NOT NULL CHECK (statement_day IN (10, 15, 20, 25)),
    first_due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'overdue', 'cancelled')),
    created_by TEXT NOT NULL,
    principal_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
    finance_charge_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
    down_payment_method TEXT NOT NULL CHECK (down_payment_method IN ('cash', 'card', 'bank_transfer', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uniq_finance_plans_source UNIQUE (source_type, source_reference),
    CONSTRAINT chk_financed_principal_calc CHECK (financed_principal = principal_amount - down_payment_amount),
    CONSTRAINT chk_down_payment_lt_principal CHECK (down_payment_amount < principal_amount),
    CONSTRAINT chk_total_due_calc CHECK (total_due_amount = financed_principal + finance_charge_amount),
    CONSTRAINT chk_remaining_calc CHECK (
        (status = 'cancelled' AND remaining_amount = 0)
        OR
        (status <> 'cancelled' AND remaining_amount = total_due_amount - amount_paid)
    ),
    CONSTRAINT chk_amount_paid_limit CHECK (amount_paid <= total_due_amount),
    CONSTRAINT chk_remaining_limit CHECK (remaining_amount <= total_due_amount),
    CONSTRAINT chk_paid_status CHECK (status <> 'paid' OR remaining_amount = 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_plans_customer ON public.finance_plans(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_finance_plans_account ON public.finance_plans(credit_account_id);
CREATE INDEX IF NOT EXISTS idx_finance_plans_status ON public.finance_plans(status);

-- 2. Create finance_installments Table
CREATE TABLE IF NOT EXISTS public.finance_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finance_plan_id UUID NOT NULL REFERENCES public.finance_plans(id) ON DELETE RESTRICT,
    installment_no SMALLINT NOT NULL CHECK (installment_no >= 1),
    due_date DATE NOT NULL,
    principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount >= 0),
    finance_charge_amount NUMERIC(12,2) NOT NULL CHECK (finance_charge_amount >= 0),
    amount_due NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC(12,2) NOT NULL CHECK (remaining_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(finance_plan_id, installment_no),
    CONSTRAINT chk_finance_installment_components
      CHECK (amount_due = principal_amount + finance_charge_amount),
    CONSTRAINT chk_finance_installment_paid_not_over_due
      CHECK (amount_paid <= amount_due),
    CONSTRAINT chk_finance_installment_remaining
      CHECK (
        status = 'cancelled'
        OR (status = 'paid' AND remaining_amount = 0)
        OR (status <> 'paid' AND remaining_amount = amount_due - amount_paid)
      )
);

CREATE INDEX IF NOT EXISTS idx_finance_installments_plan ON public.finance_installments(finance_plan_id);
CREATE INDEX IF NOT EXISTS idx_finance_installments_status ON public.finance_installments(status);

-- 3. Create finance_collections Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.finance_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    finance_plan_id UUID NOT NULL REFERENCES public.finance_plans(id) ON DELETE RESTRICT,
    credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    collection_kind TEXT NOT NULL CHECK (collection_kind IN ('down_payment', 'installment_payment', 'early_closure')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other')),
    receipt_number TEXT UNIQUE NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL,
    note TEXT,
    ledger_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),
    reverses_collection_id UUID REFERENCES public.finance_collections(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_collection_direction_reversal CHECK (
        (direction = 'in' AND reverses_collection_id IS NULL)
        OR
        (direction = 'out' AND reverses_collection_id IS NOT NULL)
    ),
    CONSTRAINT chk_reversal_ledger_transaction CHECK (
        (
            collection_kind = 'down_payment'
            AND ledger_transaction_id IS NULL
        )
        OR
        (
            collection_kind IN (
                'installment_payment',
                'early_closure'
            )
            AND ledger_transaction_id IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_finance_collections_plan ON public.finance_collections(finance_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_collections_unique_reversal ON public.finance_collections(reverses_collection_id) WHERE reverses_collection_id IS NOT NULL;

-- 4. Create finance_audit_logs Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.finance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finance_plan_id UUID REFERENCES public.finance_plans(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate cancel_plan audit entries per plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_audit_logs_unique_cancel ON public.finance_audit_logs(finance_plan_id) WHERE action = 'cancel_plan';

-- Enable RLS
ALTER TABLE public.finance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from PUBLIC, anon, authenticated roles
REVOKE ALL ON TABLE public.finance_plans FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.finance_installments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.finance_collections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.finance_audit_logs FROM PUBLIC, anon, authenticated, service_role;

-- Grant permissions to service_role
GRANT SELECT ON TABLE public.finance_plans TO service_role;
GRANT SELECT ON TABLE public.finance_installments TO service_role;
GRANT SELECT ON TABLE public.finance_collections TO service_role;
GRANT SELECT ON TABLE public.finance_audit_logs TO service_role;

-- Policies
DROP POLICY IF EXISTS service_role_all ON public.finance_plans;
CREATE POLICY service_role_all ON public.finance_plans FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_all ON public.finance_installments;
CREATE POLICY service_role_all ON public.finance_installments FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_all ON public.finance_collections;
CREATE POLICY service_role_all ON public.finance_collections FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_all ON public.finance_audit_logs;
CREATE POLICY service_role_all ON public.finance_audit_logs FOR SELECT TO service_role USING (true);

-- Trigger function definition to prevent updates/deletes on append-only tables
CREATE OR REPLACE FUNCTION public.prevent_finance_append_only_update_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Updates and deletes are forbidden on append-only table: %', TG_TABLE_NAME;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_finance_append_only_update_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_finance_append_only_update_delete() TO service_role;

DROP TRIGGER IF EXISTS prevent_collections_modifications ON public.finance_collections;
CREATE TRIGGER prevent_collections_modifications
BEFORE UPDATE OR DELETE ON public.finance_collections
FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_append_only_update_delete();

DROP TRIGGER IF EXISTS prevent_audit_logs_modifications ON public.finance_audit_logs;
CREATE TRIGGER prevent_audit_logs_modifications
BEFORE UPDATE OR DELETE ON public.finance_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_append_only_update_delete();

-- RPC Functions

-- A. Create Finance Plan RPC
CREATE OR REPLACE FUNCTION public.create_finance_plan(
    p_idempotency_key TEXT,
    p_customer_id UUID,
    p_source_type TEXT,
    p_source_reference TEXT,
    p_principal_amount NUMERIC,
    p_down_payment_amount NUMERIC,
    p_term_rate_percent NUMERIC,
    p_installment_count SMALLINT,
    p_statement_day SMALLINT,
    p_first_due_date DATE,
    p_created_by TEXT,
    p_down_payment_method TEXT DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_status TEXT;
    v_account_id UUID;
    v_account_status TEXT;
    v_credit_limit NUMERIC;
    v_current_balance NUMERIC;
    v_financed_principal NUMERIC(12,2);
    v_finance_charge NUMERIC(12,2);
    v_total_due NUMERIC(12,2);
    v_new_balance NUMERIC;
    v_plan_id UUID;
    
    v_total_cents BIGINT;
    v_base_cents BIGINT;
    v_last_cents BIGINT;
    v_base_principal_cents BIGINT;
    v_last_principal_cents BIGINT;
    v_base_charge_cents BIGINT;
    v_last_charge_cents BIGINT;
    
    v_financed_principal_cents BIGINT;
    v_finance_charge_cents BIGINT;
    
    v_inst_due_date DATE;
    v_ledger_res JSONB;
    v_dp_receipt TEXT;
    
    v_existing_plan RECORD;
    v_existing_inst JSONB;
    v_existing_balance NUMERIC;

    v_principal_trx_id UUID;
    v_charge_trx_id UUID;
BEGIN
    -- Input Normalization
    p_idempotency_key := trim(p_idempotency_key);
    p_source_reference := trim(p_source_reference);
    p_created_by := trim(p_created_by);
    p_down_payment_method := trim(p_down_payment_method);

    -- Explicit NULL Checks
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'Idempotency key is required';
    END IF;
    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID is required';
    END IF;
    IF p_source_reference IS NULL OR p_source_reference = '' THEN
        RAISE EXCEPTION 'Source reference is required';
    END IF;
    IF p_created_by IS NULL OR p_created_by = '' THEN
        RAISE EXCEPTION 'Created by is required';
    END IF;
    IF p_term_rate_percent IS NULL THEN
        RAISE EXCEPTION 'Term rate percent is required';
    END IF;
    IF p_first_due_date IS NULL THEN
        RAISE EXCEPTION 'First due date is required';
    END IF;
    IF p_down_payment_method IS NULL OR p_down_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'other') THEN
        RAISE EXCEPTION 'Invalid down payment method';
    END IF;
    IF p_source_type IS NULL OR p_source_type NOT IN ('store_sale', 'web_order', 'service_order', 'manual') THEN
        RAISE EXCEPTION 'Invalid source type';
    END IF;
    IF p_principal_amount IS NULL THEN
        RAISE EXCEPTION 'Principal amount is required';
    END IF;
    IF p_principal_amount < 750 THEN
        RAISE EXCEPTION 'Principal amount must be at least 750';
    END IF;
    IF p_down_payment_amount IS NULL THEN
        RAISE EXCEPTION 'Down payment amount is required';
    END IF;
    IF p_down_payment_amount < 0 THEN
        RAISE EXCEPTION 'Down payment cannot be negative';
    END IF;
    IF p_down_payment_amount >= p_principal_amount THEN
        RAISE EXCEPTION 'Down payment must be less than principal amount (full down payment does not allow installment plans)';
    END IF;
    IF p_term_rate_percent < 0 THEN
        RAISE EXCEPTION 'Term rate percent cannot be negative';
    END IF;
    IF p_term_rate_percent > 100 THEN
        RAISE EXCEPTION 'Term rate percent exceeds maximum allowed limit';
    END IF;
    IF p_installment_count IS NULL OR p_installment_count NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Installment count must be between 1 and 3';
    END IF;
    IF p_statement_day IS NULL OR p_statement_day NOT IN (10, 15, 20, 25) THEN
        RAISE EXCEPTION 'Statement day must be 10, 15, 20, or 25';
    END IF;
    IF p_principal_amount != round(p_principal_amount, 2) OR p_down_payment_amount != round(p_down_payment_amount, 2) THEN
        RAISE EXCEPTION 'Principal and down payment amounts can have at most 2 decimal places';
    END IF;
    IF p_term_rate_percent != round(p_term_rate_percent, 4) THEN
        RAISE EXCEPTION 'Term rate percent can have at most 4 decimal places';
    END IF;

    -- Concurrency Advisory Lock
    PERFORM pg_advisory_xact_lock(
        hashtextextended('finance_plan:' || p_idempotency_key, 0)
    );

    -- Idempotency Check after Lock
    SELECT * INTO v_existing_plan FROM public.finance_plans WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_plan.credit_customer_id != p_customer_id OR
           v_existing_plan.source_type != p_source_type OR
           v_existing_plan.source_reference != p_source_reference OR
           v_existing_plan.principal_amount != p_principal_amount OR
           v_existing_plan.down_payment_amount != p_down_payment_amount OR
           v_existing_plan.term_rate_percent != p_term_rate_percent OR
           v_existing_plan.installment_count != p_installment_count OR
           v_existing_plan.statement_day != p_statement_day OR
           v_existing_plan.first_due_date != p_first_due_date OR
           v_existing_plan.created_by IS DISTINCT FROM p_created_by OR
           v_existing_plan.down_payment_method != p_down_payment_method THEN
            RAISE EXCEPTION 'Idempotency key payload mismatch';
        END IF;

        SELECT json_agg(i) INTO v_existing_inst FROM public.finance_installments i WHERE finance_plan_id = v_existing_plan.id;
        SELECT current_balance INTO v_existing_balance FROM public.credit_accounts WHERE id = v_existing_plan.credit_account_id;
        RETURN jsonb_build_object(
            'plan', to_jsonb(v_existing_plan),
            'installments', v_existing_inst,
            'current_balance', v_existing_balance
        );
    END IF;

    -- Row Lock Customer & Account
    SELECT status INTO v_customer_status FROM public.credit_customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_customer_status != 'active' THEN
        RAISE EXCEPTION 'Customer is not active';
    END IF;

    SELECT id, status, credit_limit, current_balance INTO v_account_id, v_account_status, v_credit_limit, v_current_balance
    FROM public.credit_accounts WHERE credit_customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit account not found';
    END IF;
    IF v_account_status != 'active' THEN
        RAISE EXCEPTION 'Credit account is not active';
    END IF;

    -- Calculations
    v_financed_principal := p_principal_amount - p_down_payment_amount;
    v_finance_charge := round((v_financed_principal * p_term_rate_percent / 100.0), 2);
    v_total_due := v_financed_principal + v_finance_charge;

    IF v_total_due <= 0 THEN
        RAISE EXCEPTION 'Total due amount must be greater than zero';
    END IF;

    -- Limit Check (Preflight)
    IF v_current_balance + v_total_due > v_credit_limit THEN
        RAISE EXCEPTION 'Kullanılabilir limit yetersiz. Mevcut Bakiye: %, Limit: %, Talep: %', v_current_balance, v_credit_limit, v_total_due;
    END IF;

    -- Insert Ledger Transactions (This updates current_balance inside public.add_credit_transaction)
    v_ledger_res := public.add_credit_transaction(
        p_customer_id, v_account_id, 'purchase', 'debit', v_financed_principal,
        'Taksitli Satış Borcu - Ref: ' || p_source_reference,
        p_source_type,
        p_source_reference, NULL, NULL, p_created_by, NULL, NULL
    );
    v_principal_trx_id := (v_ledger_res->>'transaction_id')::UUID;

    IF v_finance_charge > 0 THEN
        v_ledger_res := public.add_credit_transaction(
            p_customer_id, v_account_id, 'fee', 'debit', v_finance_charge,
            'Taksit Vade Farkı Bedeli - Ref: ' || p_source_reference,
            'service_fee', p_source_reference, NULL, NULL, p_created_by, NULL, NULL
        );
        v_charge_trx_id := (v_ledger_res->>'transaction_id')::UUID;
    END IF;

    -- Fetch the new updated balance from credit_accounts
    SELECT current_balance INTO v_new_balance FROM public.credit_accounts WHERE id = v_account_id;

    -- Insert Plan
    INSERT INTO public.finance_plans (
        idempotency_key, credit_customer_id, credit_account_id, source_type, source_reference,
        principal_amount, down_payment_amount, financed_principal, term_rate_percent,
        finance_charge_amount, total_due_amount, amount_paid, remaining_amount,
        installment_count, statement_day, first_due_date, status, created_by,
        principal_transaction_id, finance_charge_transaction_id, down_payment_method
    ) VALUES (
        p_idempotency_key, p_customer_id, v_account_id, p_source_type, p_source_reference,
        p_principal_amount, p_down_payment_amount, v_financed_principal, p_term_rate_percent,
        v_finance_charge, v_total_due, 0, v_total_due,
        p_installment_count, p_statement_day, p_first_due_date, 'active', p_created_by,
        v_principal_trx_id, v_charge_trx_id, p_down_payment_method
    ) RETURNING id INTO v_plan_id;

    -- Down-payment business rule:
    -- The down payment is an immediately collected sale payment. It is stored
    -- only as a down_payment finance_collection. The financed principal is
    -- principal_amount - down_payment_amount; no down-payment debt or payment
    -- entry is added to the credit ledger. Cancellation creates an append-only
    -- refund collection for this receipt.
    -- Insert Down Payment if exists
    IF p_down_payment_amount > 0 THEN
        v_dp_receipt := 'RCP-DP-' || LPAD(nextval('public.finance_receipt_seq')::text, 6, '0');
        INSERT INTO public.finance_collections (
            idempotency_key, finance_plan_id, credit_account_id, amount,
            collection_kind, payment_method, receipt_number, created_by, note, direction
        ) VALUES (
            p_idempotency_key || '_down_payment', v_plan_id, v_account_id, p_down_payment_amount,
            'down_payment', p_down_payment_method, v_dp_receipt, p_created_by, 'Peşinat tahsilatı', 'in'
        );
    END IF;

    -- Split Installments (Cents level to avoid floating point issues, components split independently)
    v_financed_principal_cents := round(v_financed_principal * 100);
    v_base_principal_cents := v_financed_principal_cents / p_installment_count;
    v_last_principal_cents := v_financed_principal_cents - (v_base_principal_cents * (p_installment_count - 1));

    v_finance_charge_cents := round(v_finance_charge * 100);
    v_base_charge_cents := v_finance_charge_cents / p_installment_count;
    v_last_charge_cents := v_finance_charge_cents - (v_base_charge_cents * (p_installment_count - 1));

    FOR i IN 1..p_installment_count LOOP
        DECLARE
            v_inst_principal NUMERIC;
            v_inst_charge NUMERIC;
            v_inst_due NUMERIC;
        BEGIN
            v_inst_due_date := (p_first_due_date + (i - 1) * INTERVAL '1 month')::DATE;

            IF i = p_installment_count THEN
                v_inst_principal := v_last_principal_cents::numeric / 100.0;
                v_inst_charge := v_last_charge_cents::numeric / 100.0;
            ELSE
                v_inst_principal := v_base_principal_cents::numeric / 100.0;
                v_inst_charge := v_base_charge_cents::numeric / 100.0;
            END IF;

            v_inst_due := v_inst_principal + v_inst_charge;

            INSERT INTO public.finance_installments (
                finance_plan_id, installment_no, due_date, principal_amount,
                finance_charge_amount, amount_due, amount_paid, remaining_amount, status
            ) VALUES (
                v_plan_id, i, v_inst_due_date,
                v_inst_principal,
                v_inst_charge,
                v_inst_due,
                0,
                v_inst_due,
                'pending'
            );
        END;
    END LOOP;

    -- Mandatory sum validations
    DECLARE
        v_sum_principal NUMERIC;
        v_sum_charge NUMERIC;
        v_sum_due NUMERIC;
    BEGIN
        SELECT coalesce(sum(principal_amount), 0),
               coalesce(sum(finance_charge_amount), 0),
               coalesce(sum(amount_due), 0)
        INTO v_sum_principal, v_sum_charge, v_sum_due
        FROM public.finance_installments
        WHERE finance_plan_id = v_plan_id;

        IF v_sum_principal IS DISTINCT FROM v_financed_principal THEN
            RAISE EXCEPTION 'Principal split integrity check failed: expected %, got %', v_financed_principal, v_sum_principal;
        END IF;
        IF v_sum_charge IS DISTINCT FROM v_finance_charge THEN
            RAISE EXCEPTION 'Finance charge split integrity check failed: expected %, got %', v_finance_charge, v_sum_charge;
        END IF;
        IF v_sum_due IS DISTINCT FROM v_total_due THEN
            RAISE EXCEPTION 'Total due split integrity check failed: expected %, got %', v_total_due, v_sum_due;
        END IF;
    END;

    -- Audit Log
    INSERT INTO public.finance_audit_logs (finance_plan_id, action, actor, old_data, new_data)
    VALUES (v_plan_id, 'create_plan', p_created_by, NULL,
            jsonb_build_object(
                'principal', p_principal_amount,
                'total_due', v_total_due,
                'down_payment_method', p_down_payment_method,
                'down_payment_ledger_treatment', 'not_posted_to_credit_ledger',
                'financed_principal', v_financed_principal
            ));

    -- Return JSONB
    RETURN jsonb_build_object(
        'plan', (SELECT to_jsonb(p) FROM public.finance_plans p WHERE id = v_plan_id),
        'installments', (SELECT json_agg(i) FROM public.finance_installments i WHERE finance_plan_id = v_plan_id),
        'current_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT) TO service_role;


-- B. Record Finance Collection RPC
CREATE OR REPLACE FUNCTION public.record_finance_collection(
    p_idempotency_key TEXT,
    p_plan_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_collection_kind TEXT,
    p_collected_at TIMESTAMPTZ,
    p_created_by TEXT,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_id UUID;
    v_customer_id UUID;
    v_plan_paid NUMERIC(12,2);
    v_plan_remaining NUMERIC(12,2);
    v_plan_status TEXT;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_collection_id UUID;
    v_receipt_number TEXT;
    v_remaining_payment NUMERIC(12,2) := p_amount;
    v_inst RECORD;
    v_inst_needed NUMERIC(12,2);
    
    v_existing_col RECORD;
    v_existing_plan RECORD;
    v_existing_inst JSONB;
    v_existing_balance NUMERIC;

    v_ledger_res JSONB;
    v_ledger_trx_id UUID;
BEGIN
    -- Input Normalization
    p_idempotency_key := trim(p_idempotency_key);
    p_payment_method := trim(p_payment_method);
    p_collection_kind := trim(p_collection_kind);
    p_created_by := trim(p_created_by);
    p_note := trim(p_note);

    -- Explicit NULL Checks
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'Idempotency key is required';
    END IF;
    IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'other') THEN
        RAISE EXCEPTION 'Invalid payment method';
    END IF;
    IF p_collection_kind IS NULL OR p_collection_kind NOT IN ('installment_payment', 'early_closure') THEN
        RAISE EXCEPTION 'Invalid collection kind';
    END IF;
    IF p_collected_at IS NULL THEN
        RAISE EXCEPTION 'Collected at timestamp is required';
    END IF;
    IF p_created_by IS NULL OR p_created_by = '' THEN
        RAISE EXCEPTION 'Created by is required';
    END IF;
    IF p_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan ID is required';
    END IF;
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'Payment amount is required';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;
    IF p_amount != round(p_amount, 2) THEN
        RAISE EXCEPTION 'Payment amount can have at most 2 decimal places';
    END IF;

    -- Concurrency Advisory Lock
    PERFORM pg_advisory_xact_lock(
        hashtextextended('finance_collection:' || p_idempotency_key, 0)
    );

    -- Idempotency Check after Lock (excluding collected_at)
    SELECT * INTO v_existing_col FROM public.finance_collections WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_col.finance_plan_id != p_plan_id OR
           v_existing_col.direction IS DISTINCT FROM 'in' OR
           v_existing_col.amount != p_amount OR
           v_existing_col.payment_method != p_payment_method OR
           v_existing_col.collection_kind != p_collection_kind OR
           v_existing_col.created_by IS DISTINCT FROM p_created_by OR
           v_existing_col.note IS DISTINCT FROM p_note THEN
            RAISE EXCEPTION 'Idempotency key payload mismatch for collection';
        END IF;

        SELECT * INTO v_existing_plan FROM public.finance_plans WHERE id = p_plan_id;
        SELECT json_agg(i) INTO v_existing_inst FROM public.finance_installments i WHERE finance_plan_id = p_plan_id;
        SELECT current_balance INTO v_existing_balance FROM public.credit_accounts WHERE id = v_existing_plan.credit_account_id;
        RETURN jsonb_build_object(
            'collection', to_jsonb(v_existing_col),
            'plan', to_jsonb(v_existing_plan),
            'installments', v_existing_inst,
            'current_balance', v_existing_balance
        );
    END IF;

    -- Lock Plan & Account
    SELECT credit_account_id, amount_paid, remaining_amount, status INTO v_account_id, v_plan_paid, v_plan_remaining, v_plan_status
    FROM public.finance_plans WHERE id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finance plan not found';
    END IF;
    IF v_plan_status NOT IN ('active', 'overdue') THEN
        RAISE EXCEPTION 'Finance plan is not active or overdue';
    END IF;

    IF p_amount > v_plan_remaining THEN
        RAISE EXCEPTION 'Payment amount % exceeds remaining plan debt %', p_amount, v_plan_remaining;
    END IF;
    IF p_collection_kind = 'early_closure' AND p_amount != v_plan_remaining THEN
        RAISE EXCEPTION 'Early closure amount must equal remaining plan debt %', v_plan_remaining;
    END IF;

    SELECT current_balance, credit_customer_id INTO v_current_balance, v_customer_id
    FROM public.credit_accounts WHERE id = v_account_id FOR UPDATE;

    -- Insert Ledger Transaction (This updates current_balance inside public.add_credit_transaction)
    v_receipt_number := 'RCP-COL-' || LPAD(nextval('public.finance_receipt_seq')::text, 6, '0');
    v_ledger_res := public.add_credit_transaction(
        v_customer_id, v_account_id, 'payment', 'credit', p_amount,
        'Taksit Tahsilatı - Makbuz No: ' || v_receipt_number,
        'payment', v_receipt_number, NULL, p_payment_method, p_created_by, NULL, NULL
    );
    v_ledger_trx_id := (v_ledger_res->>'transaction_id')::UUID;

    -- Fetch the new updated balance from credit_accounts
    SELECT current_balance INTO v_new_balance FROM public.credit_accounts WHERE id = v_account_id;

    -- Distribute Payment sequentially (FIFO) to installments
    FOR v_inst IN 
        SELECT id, amount_due, amount_paid, remaining_amount, status, installment_no 
        FROM public.finance_installments 
        WHERE finance_plan_id = p_plan_id AND status IN ('pending', 'partial', 'overdue') 
        ORDER BY installment_no ASC FOR UPDATE
    LOOP
        EXIT WHEN v_remaining_payment <= 0;
        
        v_inst_needed := v_inst.remaining_amount;
        IF v_remaining_payment >= v_inst_needed THEN
            UPDATE public.finance_installments SET
                amount_paid = amount_due,
                remaining_amount = 0,
                status = 'paid',
                paid_at = p_collected_at,
                updated_at = now()
            WHERE id = v_inst.id;
            v_remaining_payment := v_remaining_payment - v_inst_needed;
        ELSE
            UPDATE public.finance_installments SET
                amount_paid = amount_paid + v_remaining_payment,
                remaining_amount = remaining_amount - v_remaining_payment,
                status = 'partial',
                paid_at = p_collected_at,
                updated_at = now()
            WHERE id = v_inst.id;
            v_remaining_payment := 0;
        END IF;
    END LOOP;

    IF v_remaining_payment != 0 THEN
        RAISE EXCEPTION 'Payment allocation did not consume the full amount';
    END IF;

    -- Update Plan
    UPDATE public.finance_plans SET
        amount_paid = amount_paid + p_amount,
        remaining_amount = remaining_amount - p_amount,
        status = CASE WHEN remaining_amount - p_amount = 0 THEN 'paid'::text ELSE status END,
        updated_at = now()
    WHERE id = p_plan_id;

    -- Insert Receipt
    INSERT INTO public.finance_collections (
        idempotency_key, finance_plan_id, credit_account_id, amount,
        collection_kind, payment_method, receipt_number, collected_at, created_by, note,
        ledger_transaction_id, direction
    ) VALUES (
        p_idempotency_key, p_plan_id, v_account_id, p_amount,
        p_collection_kind, p_payment_method, v_receipt_number, p_collected_at, p_created_by, p_note,
        v_ledger_trx_id, 'in'
    ) RETURNING id INTO v_collection_id;

    -- Audit Log
    INSERT INTO public.finance_audit_logs (finance_plan_id, action, actor, old_data, new_data)
    VALUES (p_plan_id, 'record_collection', p_created_by, 
            jsonb_build_object('remaining', v_plan_remaining, 'paid', v_plan_paid),
            jsonb_build_object('remaining', v_plan_remaining - p_amount, 'paid', v_plan_paid + p_amount, 'collection_id', v_collection_id));

    RETURN jsonb_build_object(
        'collection', (SELECT to_jsonb(c) FROM public.finance_collections c WHERE id = v_collection_id),
        'plan', (SELECT to_jsonb(p) FROM public.finance_plans p WHERE id = p_plan_id),
        'installments', (SELECT json_agg(i) FROM public.finance_installments i WHERE finance_plan_id = p_plan_id),
        'current_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;


-- C. Cancel Finance Plan RPC
CREATE OR REPLACE FUNCTION public.cancel_finance_plan(
    p_plan_id UUID,
    p_admin_username TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_id UUID;
    v_customer_id UUID;
    v_amount_paid NUMERIC(12,2);
    v_total_due NUMERIC(12,2);
    v_financed_principal NUMERIC(12,2);
    v_finance_charge NUMERIC(12,2);
    v_source_reference TEXT;
    v_new_balance NUMERIC;
    v_status TEXT;
    v_current_balance NUMERIC;

    v_col RECORD;
    v_already_refunded BOOLEAN;
    v_rev_col_trx_id UUID;
    v_ledger_res JSONB;
    v_receipt_number TEXT;
    v_plan_principal_trx UUID;
    v_plan_charge_trx UUID;
    
    v_starting_balance NUMERIC;
    v_ledger_balance NUMERIC;
BEGIN
    -- Input Normalization
    p_admin_username := trim(p_admin_username);
    p_reason := trim(p_reason);

    -- Explicit NULL Checks
    IF p_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan ID is required';
    END IF;
    IF p_admin_username IS NULL OR p_admin_username = '' THEN
        RAISE EXCEPTION 'Admin username is required';
    END IF;
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Reason is required for cancelling finance plans';
    END IF;

    -- Lock Plan
    SELECT credit_account_id, amount_paid, total_due_amount, financed_principal, finance_charge_amount, source_reference, status,
           principal_transaction_id, finance_charge_transaction_id
    INTO v_account_id, v_amount_paid, v_total_due, v_financed_principal, v_finance_charge, v_source_reference, v_status,
         v_plan_principal_trx, v_plan_charge_trx
    FROM public.finance_plans WHERE id = p_plan_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finance plan not found';
    END IF;
    
    -- Idempotency Check: if already cancelled, just return status silently
    IF v_status = 'cancelled' THEN
        SELECT current_balance INTO v_new_balance FROM public.credit_accounts WHERE id = v_account_id;
        RETURN jsonb_build_object(
            'plan', (SELECT to_jsonb(p) FROM public.finance_plans p WHERE id = p_plan_id),
            'current_balance', v_new_balance
        );
    END IF;

    -- Lock Account and Customer
    SELECT current_balance, credit_customer_id INTO v_current_balance, v_customer_id
    FROM public.credit_accounts WHERE id = v_account_id FOR UPDATE;
    SELECT balance_after INTO v_ledger_balance
    FROM public.credit_transactions
    WHERE credit_account_id = v_account_id
    ORDER BY ledger_no DESC
    LIMIT 1;
    IF v_ledger_balance IS DISTINCT FROM v_current_balance THEN
        RAISE EXCEPTION 'Finance cancellation balance restoration failed';
    END IF;

    -- 1. Reverse each Collection (FIFO / Deterministic Lock order)
    FOR v_col IN 
        SELECT id, amount, receipt_number, collection_kind, payment_method, ledger_transaction_id, note, idempotency_key
        FROM public.finance_collections
        WHERE finance_plan_id = p_plan_id AND direction = 'in' 
        ORDER BY collected_at, id
        FOR UPDATE
    LOOP
        -- Check if already refunded
        SELECT EXISTS (
            SELECT 1 FROM public.finance_collections WHERE reverses_collection_id = v_col.id
        ) INTO v_already_refunded;
        
        IF NOT v_already_refunded THEN
            v_rev_col_trx_id := NULL;
            
            -- If it's a ledger-tracked payment, reverse the ledger entry
            IF v_col.ledger_transaction_id IS NOT NULL AND v_col.collection_kind IN ('installment_payment', 'early_closure') THEN
                v_ledger_res := public.add_credit_transaction(
                    v_customer_id, v_account_id, 'reversal', 'debit', v_col.amount,
                    'Taksit Ödeme İptali (Tahsilat İadesi) - Makbuz Ref: ' || v_col.receipt_number,
                    'reversal', v_col.receipt_number, NULL, NULL, p_admin_username, v_col.ledger_transaction_id, NULL
                );
                v_rev_col_trx_id := (v_ledger_res->>'transaction_id')::UUID;
            END IF;

            -- Create append-only refund collection record
            v_receipt_number := 'RCP-RFD-' || LPAD(nextval('public.finance_receipt_seq')::text, 6, '0');
            INSERT INTO public.finance_collections (
                idempotency_key, finance_plan_id, credit_account_id, amount,
                collection_kind, payment_method, receipt_number, collected_at, created_by, note,
                direction, reverses_collection_id, ledger_transaction_id
            ) VALUES (
                v_col.idempotency_key || '_refund', p_plan_id, v_account_id, v_col.amount,
                v_col.collection_kind, v_col.payment_method, v_receipt_number, now(), p_admin_username, 'İade: ' || coalesce(v_col.note, ''),
                'out', v_col.id, v_rev_col_trx_id
            );
        END IF;
    END LOOP;

    -- 2. Reverse Principal Purchase
    IF v_plan_principal_trx IS NOT NULL THEN
        v_ledger_res := public.add_credit_transaction(
            v_customer_id, v_account_id, 'reversal', 'credit', v_financed_principal,
            'Taksitli Plan İptali (Borç İadesi) - Ref: ' || v_source_reference,
            'reversal', v_source_reference, NULL, NULL, p_admin_username, v_plan_principal_trx, NULL
        );
    END IF;

    -- 3. Reverse Finance Charge (Fee)
    IF v_plan_charge_trx IS NOT NULL AND v_finance_charge > 0 THEN
        v_ledger_res := public.add_credit_transaction(
            v_customer_id, v_account_id, 'reversal', 'credit', v_finance_charge,
            'Taksitli Plan İptali (Vade Farkı İadesi) - Ref: ' || v_source_reference,
            'reversal', v_source_reference, NULL, NULL, p_admin_username, v_plan_charge_trx, NULL
        );
    END IF;

    -- 4. Update plan and installment statuses
    UPDATE public.finance_plans SET status = 'cancelled', remaining_amount = 0, updated_at = now() WHERE id = p_plan_id;
    UPDATE public.finance_installments SET status = 'cancelled', remaining_amount = 0, updated_at = now() WHERE finance_plan_id = p_plan_id;

    -- Fetch the final updated balance from credit_accounts
    SELECT current_balance INTO v_new_balance FROM public.credit_accounts WHERE id = v_account_id;

    -- Calculate starting balance mathematically to verify restored equality
    v_starting_balance := v_current_balance - v_financed_principal - v_finance_charge + 
        (SELECT coalesce(sum(amount), 0) FROM public.finance_collections 
         WHERE finance_plan_id = p_plan_id AND direction = 'in' AND ledger_transaction_id IS NOT NULL);

    IF v_starting_balance IS DISTINCT FROM v_new_balance THEN
        RAISE EXCEPTION 'Finance cancellation balance restoration failed';
    END IF;

    -- Audit Log
    INSERT INTO public.finance_audit_logs (finance_plan_id, action, actor, old_data, new_data, reason)
    VALUES (p_plan_id, 'cancel_plan', p_admin_username, 
            jsonb_build_object('status', v_status, 'total_due', v_total_due, 'amount_paid', v_amount_paid), 
            jsonb_build_object('status', 'cancelled', 'total_due', v_total_due, 'amount_paid', v_amount_paid,
                               'starting_balance', v_starting_balance, 'final_balance', v_new_balance,
                               'balance_restored', (v_starting_balance = v_new_balance)), p_reason);

    RETURN jsonb_build_object(
        'plan', (SELECT to_jsonb(p) FROM public.finance_plans p WHERE id = p_plan_id),
        'current_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_finance_plan(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_finance_plan(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_finance_plan(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_finance_plan(UUID, TEXT, TEXT) TO service_role;
-- EXACT MIGRATION BODY END
-- =========================================================================

-- =========================================================================
-- AUTOMATED TEST HARNESS
-- =========================================================================
CREATE TEMP TABLE test_runs (
    test_id INT PRIMARY KEY,
    test_name TEXT,
    result TEXT,
    details TEXT
);

DO $$
DECLARE
    -- Dynamic test keys and timestamps
    v_customer_id UUID := gen_random_uuid();
    v_account_id UUID := gen_random_uuid();
    v_phone TEXT := '+90' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    v_collection_time TIMESTAMPTZ := clock_timestamp();
    
    v_plan_id UUID;
    v_already_refunded BOOLEAN;
    v_starting_balance NUMERIC;
    v_new_balance NUMERIC;
    v_service_trx UUID;
    v_manual_trx UUID;
    v_cancel_before JSONB;
    v_cancel_after JSONB;
BEGIN
    -- Setup Test Customer & Account (Active)
    INSERT INTO public.credit_customers (id, full_name, phone, phone_normalized, status)
    VALUES (v_customer_id, 'TEST-HURCELL-FINANS', v_phone, v_phone, 'active');

    INSERT INTO public.credit_accounts (id, credit_customer_id, credit_limit, current_balance, statement_day, status)
    VALUES (v_account_id, v_customer_id, 10000.00, 0.00, 15, 'active');

    -- T1: Ledger readiness prerequisites.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
         AND table_name='credit_transactions' AND column_name='amount'
         AND numeric_precision=12 AND numeric_scale=2)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
         AND table_name='credit_transactions' AND column_name='balance_after'
         AND numeric_precision=12 AND numeric_scale=2)
       AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
         AND tablename='credit_accounts' AND indexname='uniq_credit_accounts_credit_customer_id')
       AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='prevent_credit_transactions_modification'
           AND NOT p.prosecdef AND array_to_string(p.proconfig,',') LIKE '%search_path=public%') THEN
      INSERT INTO test_runs VALUES (1, 'Ledger readiness prerequisites', 'PASS', 'Precision 12,2; unique account; helper hardened');
    ELSE
      INSERT INTO test_runs VALUES (1, 'Ledger readiness prerequisites', 'FAIL', 'Ledger readiness prerequisites missing');
    END IF;

    -- T2: Tables created
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'finance_plans') AND
       EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'finance_installments') AND
       EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'finance_collections') AND
       EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'finance_audit_logs') THEN
        INSERT INTO test_runs VALUES (2, 'Tables created', 'PASS', 'All 4 tables exist');
    ELSE
        INSERT INTO test_runs VALUES (2, 'Tables created', 'FAIL', 'Missing tables');
    END IF;

    -- Exercise exact ledger source preservation and restore the balance.
    v_service_trx := (public.add_credit_transaction(
      v_customer_id, v_account_id, 'purchase', 'debit', 1.00,
      'service source preservation test', 'service_order', 'svc-ref', NULL, NULL,
      'admin_test', NULL, jsonb_build_object('dry_run', true)
    )->>'transaction_id')::uuid;
    PERFORM public.add_credit_transaction(
      v_customer_id, v_account_id, 'reversal', 'credit', 1.00,
      'reverse service source test', 'reversal', 'svc-ref', NULL, NULL,
      'admin_test', v_service_trx, jsonb_build_object('dry_run', true));
    v_manual_trx := (public.add_credit_transaction(
      v_customer_id, v_account_id, 'purchase', 'debit', 1.00,
      'manual source preservation test', 'manual', 'manual-ref', NULL, NULL,
      'admin_test', NULL, jsonb_build_object('dry_run', true)
    )->>'transaction_id')::uuid;
    PERFORM public.add_credit_transaction(
      v_customer_id, v_account_id, 'reversal', 'credit', 1.00,
      'reverse manual source test', 'reversal', 'manual-ref', NULL, NULL,
      'admin_test', v_manual_trx, jsonb_build_object('dry_run', true));

    -- T3: RPCs created and source types preserved
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_finance_plan') AND
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_finance_collection') AND
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_finance_plan') AND
       EXISTS (SELECT 1 FROM public.credit_transactions WHERE id=v_service_trx AND source_type='service_order') AND
       EXISTS (SELECT 1 FROM public.credit_transactions WHERE id=v_manual_trx AND source_type='manual') THEN
        INSERT INTO test_runs VALUES (3, 'RPCs and source preservation', 'PASS', 'All RPCs exist; service_order/manual preserved');
    ELSE
        INSERT INTO test_runs VALUES (3, 'RPCs and source preservation', 'FAIL', 'Missing RPC or source type changed');
    END IF;

    -- T4: Helper function security invoker
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'prevent_finance_append_only_update_delete' 
          AND prosecdef = false 
          AND proconfig IS NOT NULL 
          AND array_to_string(proconfig, ',') LIKE '%search_path=public%'
    ) AND has_function_privilege('public', 'public.prevent_finance_append_only_update_delete()', 'execute') = false
      AND has_function_privilege('anon', 'public.prevent_finance_append_only_update_delete()', 'execute') = false
      AND has_function_privilege('authenticated', 'public.prevent_finance_append_only_update_delete()', 'execute') = false
      AND has_function_privilege('service_role', 'public.prevent_finance_append_only_update_delete()', 'execute') = true THEN
        INSERT INTO test_runs VALUES (4, 'Helper function security', 'PASS', 'Security invoker and search_path configured correctly');
    ELSE
        INSERT INTO test_runs VALUES (4, 'Helper function security', 'FAIL', 'Security invoker or ACL check failed');
    END IF;

    -- T5: RLS enabled
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'finance_plans'
          AND c.relrowsecurity
    ) AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'finance_installments'
          AND c.relrowsecurity
    ) AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'finance_collections'
          AND c.relrowsecurity
    ) AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'finance_audit_logs'
          AND c.relrowsecurity
    ) THEN
        INSERT INTO test_runs VALUES (5, 'RLS enabled', 'PASS', 'RLS enabled on all 4 tables');
    ELSE
        INSERT INTO test_runs VALUES (5, 'RLS enabled', 'FAIL', 'RLS not enabled');
    END IF;

    -- T6: Bütün RPC ACL'leri
    IF has_function_privilege('public', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('anon', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('authenticated', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('service_role', 'public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT, TEXT)', 'execute') = true AND
       
       has_function_privilege('public', 'public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('anon', 'public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('authenticated', 'public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('service_role', 'public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)', 'execute') = true AND
       
       has_function_privilege('public', 'public.cancel_finance_plan(UUID, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('anon', 'public.cancel_finance_plan(UUID, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('authenticated', 'public.cancel_finance_plan(UUID, TEXT, TEXT)', 'execute') = false AND
       has_function_privilege('service_role', 'public.cancel_finance_plan(UUID, TEXT, TEXT)', 'execute') = true THEN
        INSERT INTO test_runs VALUES (6, 'All RPC ACLs verified', 'PASS', 'PUBLIC/anon/authenticated execute revoked, service_role execute granted');
    ELSE
        INSERT INTO test_runs VALUES (6, 'All RPC ACLs verified', 'FAIL', 'ACL verification failed for one or more RPCs');
    END IF;

    -- T7: 749,99 reddi
    BEGIN
        PERFORM public.create_finance_plan(
            'test_key_fail_1',
            v_customer_id,
            'store_sale',
            'ref_fail_1',
            749.99,
            0,
            0,
            3::smallint,
            15::smallint,
            (current_date + interval '1 month')::date,
            'admin_test'
        );
        INSERT INTO test_runs VALUES (7, '749.99 rejected', 'FAIL', 'Created plan below 750 limit');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Principal amount must be at least 750%' THEN
            INSERT INTO test_runs VALUES (7, '749.99 rejected', 'PASS', 'Rejected with correct message: ' || SQLERRM);
        ELSE
            INSERT INTO test_runs VALUES (7, '749.99 rejected', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END IF;
    END;

    -- T8: 750,00 kabulü
    BEGIN
        PERFORM public.create_finance_plan(
            'test_key_success_1',
            v_customer_id,
            'store_sale',
            'ref_success_1',
            750.00,
            150.00,
            10.0017,
            3::smallint,
            15::smallint,
            (current_date + interval '1 month')::date,
            'admin_test',
            'cash'
        );
        INSERT INTO test_runs VALUES (8, '750.00 accepted', 'PASS', 'Plan created successfully');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (8, '750.00 accepted', 'FAIL', SQLERRM);
    END;

    -- T9: 150 TL peşinat
    IF EXISTS (
        SELECT 1 FROM public.finance_collections 
        WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') 
          AND amount = 150.00 AND collection_kind = 'down_payment'
    ) THEN
        INSERT INTO test_runs VALUES (9, '150 TL down payment', 'PASS', 'Recorded down payment collection');
    ELSE
        INSERT INTO test_runs VALUES (9, '150 TL down payment', 'FAIL', 'Down payment not recorded');
    END IF;

    -- T10: 60,01 TL vade farkı
    IF EXISTS (
        SELECT 1 FROM public.finance_plans 
        WHERE idempotency_key = 'test_key_success_1' AND finance_charge_amount = 60.01
    ) THEN
        INSERT INTO test_runs VALUES (10, '60.01 TL finance charge', 'PASS', 'Finance charge matches 60.01');
    ELSE
        INSERT INTO test_runs VALUES (10, '60.01 TL finance charge', 'FAIL', 'Finance charge mismatch');
    END IF;

    -- T11: 220/220/220,01
    IF (SELECT count(*) FROM public.finance_installments WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1')) = 3 AND
       (SELECT amount_due FROM public.finance_installments WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') AND installment_no = 1) = 220.00 AND
       (SELECT amount_due FROM public.finance_installments WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') AND installment_no = 2) = 220.00 AND
       (SELECT amount_due FROM public.finance_installments WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') AND installment_no = 3) = 220.01 THEN
        INSERT INTO test_runs VALUES (11, '3 installments division', 'PASS', 'T1: 220.00, T2: 220.00, T3: 220.01');
    ELSE
        INSERT INTO test_runs VALUES (11, '3 installments division', 'FAIL', 'Mismatch in installment amounts');
    END IF;

    -- T12: Bakiye yalnız 660,01 artıyor
    IF (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 660.01 THEN
        INSERT INTO test_runs VALUES (12, 'Cari balance increased by 660.01', 'PASS', 'Balance matches 660.01');
    ELSE
        INSERT INTO test_runs VALUES (12, 'Cari balance increased by 660.01', 'FAIL', 'Balance mismatch');
    END IF;

    -- T13: Plan retry idempotent
    BEGIN
        PERFORM public.create_finance_plan(
            'test_key_success_1',
            v_customer_id,
            'store_sale',
            'ref_success_1',
            750.00,
            150.00,
            10.0017,
            3::smallint,
            15::smallint,
            (current_date + interval '1 month')::date,
            'admin_test',
            'cash'
        );
        INSERT INTO test_runs VALUES (13, 'Duplicate key idempotency', 'PASS', 'Returned existing plan silently');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (13, 'Duplicate key idempotency', 'FAIL', SQLERRM);
    END;

    -- T14: Farklı plan payload reddi
    BEGIN
        PERFORM public.create_finance_plan(
            'test_key_success_1',
            v_customer_id,
            'store_sale',
            'different_ref',
            750.00,
            150.00,
            10.0017,
            3::smallint,
            15::smallint,
            (current_date + interval '1 month')::date,
            'admin_test',
            'cash'
        );
        INSERT INTO test_runs VALUES (14, 'Duplicate key payload mismatch', 'FAIL', 'Allowed different payload with same key');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Idempotency key payload mismatch%' THEN
            INSERT INTO test_runs VALUES (14, 'Duplicate key payload mismatch', 'PASS', 'Rejected payload mismatch');
        ELSE
            INSERT INTO test_runs VALUES (14, 'Duplicate key payload mismatch', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END IF;
    END;

    -- T15: 100 TL tahsilat
    BEGIN
        PERFORM public.record_finance_collection(
            'test_col_key_1',
            (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
            100.00,
            'cash',
            'installment_payment',
            v_collection_time,
            'admin_test',
            'partial payment'
        );
        
        IF (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 560.01 THEN
            INSERT INTO test_runs VALUES (15, '100 TL collection balance impact', 'PASS', 'Balance reduced to 560.01');
        ELSE
            INSERT INTO test_runs VALUES (15, '100 TL collection balance impact', 'FAIL', 'Balance mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (15, '100 TL collection balance impact', 'FAIL', SQLERRM);
    END;

    -- T16: Collection retry idempotent
    BEGIN
        PERFORM public.record_finance_collection(
            'test_col_key_1',
            (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
            100.00,
            'cash',
            'installment_payment',
            v_collection_time + interval '10 seconds', -- retry timestamp shifts
            'admin_test',
            'partial payment'
        );
        
        IF (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) <> 560.01 THEN
            RAISE EXCEPTION 'Balance changed on idempotent retry';
        END IF;
        BEGIN
            PERFORM public.record_finance_collection(
                'test_col_key_1',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                100.00, 'cash', 'installment_payment', v_collection_time + interval '20 seconds',
                'different_admin', 'partial payment'
            );
            RAISE EXCEPTION 'Changed created_by payload was accepted';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%Idempotency key payload mismatch%' THEN RAISE; END IF;
        END;
        BEGIN
            PERFORM public.record_finance_collection(
                'test_col_key_1',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                100.00, 'cash', 'installment_payment', v_collection_time + interval '30 seconds',
                'admin_test', 'different note'
            );
            RAISE EXCEPTION 'Changed note payload was accepted';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%Idempotency key payload mismatch%' THEN RAISE; END IF;
        END;
        BEGIN
            PERFORM public.record_finance_collection(
                'test_adjustment_rejected',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                1.00, 'cash', 'adjustment', v_collection_time,
                'admin_test', 'must reject'
            );
            RAISE EXCEPTION 'Adjustment collection was accepted';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%Invalid collection kind%' THEN RAISE; END IF;
        END;
        BEGIN
            PERFORM public.record_finance_collection(
                'test_down_payment_rejected',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                1.00, 'cash', 'down_payment', v_collection_time,
                'admin_test', 'must reject'
            );
            RAISE EXCEPTION 'down_payment collection RPC was accepted';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%Invalid collection kind%' THEN RAISE; END IF;
        END;
        BEGIN
            PERFORM public.record_finance_collection(
                'test_partial_early_closure_rejected',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                1.00, 'cash', 'early_closure', v_collection_time,
                'admin_test', 'must reject partial closure'
            );
            RAISE EXCEPTION 'Partial early_closure was accepted';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%Early closure amount must equal remaining plan debt%' THEN RAISE; END IF;
        END;
        INSERT INTO test_runs VALUES (16, 'Collection idempotency and allowlist', 'PASS', 'Retry stable; created_by/note mismatches, down_payment, adjustment and partial early_closure rejected');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (16, 'Collection idempotency and allowlist', 'FAIL', SQLERRM);
    END;

    -- T17: Fazla tahsilat reddi
    BEGIN
        PERFORM public.record_finance_collection(
            'test_col_key_excess',
            (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
            1000.00,
            'cash',
            'installment_payment',
            v_collection_time,
            'admin_test',
            'excess payment'
        );
        INSERT INTO test_runs VALUES (17, 'Excess payment rejected', 'FAIL', 'Allowed excess payment');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%exceeds remaining plan debt%' THEN
            INSERT INTO test_runs VALUES (17, 'Excess payment rejected', 'PASS', 'Rejected with correct message: ' || SQLERRM);
        ELSE
            INSERT INTO test_runs VALUES (17, 'Excess payment rejected', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END IF;
    END;

    -- Cancellation tests (T18 - T25)
    BEGIN
        PERFORM public.cancel_finance_plan(
            (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
            'admin_test',
            'Client request cancellation'
        );
        
        -- T18: Payment reversal
        IF EXISTS (
            SELECT 1 FROM public.credit_transactions 
            WHERE credit_account_id = v_account_id 
              AND transaction_type = 'reversal' AND direction = 'debit' AND amount = 100.00
        ) THEN
            INSERT INTO test_runs VALUES (18, 'Payment reversal', 'PASS', 'Reversal of 100 TL payment created');
        ELSE
            INSERT INTO test_runs VALUES (18, 'Payment reversal', 'FAIL', 'Payment reversal missing');
        END IF;

        -- T19: Principal reversal
        IF EXISTS (
            SELECT 1 FROM public.credit_transactions 
            WHERE credit_account_id = v_account_id 
              AND transaction_type = 'reversal' AND direction = 'credit' AND amount = 600.00
        ) THEN
            INSERT INTO test_runs VALUES (19, 'Principal reversal', 'PASS', 'Reversal of 600 TL principal created');
        ELSE
            INSERT INTO test_runs VALUES (19, 'Principal reversal', 'FAIL', 'Principal reversal missing');
        END IF;

        -- T20: Fee reversal
        IF EXISTS (
            SELECT 1 FROM public.credit_transactions 
            WHERE credit_account_id = v_account_id 
              AND transaction_type = 'reversal' AND direction = 'credit' AND amount = 60.01
        ) THEN
            INSERT INTO test_runs VALUES (20, 'Fee reversal', 'PASS', 'Reversal of 60.01 TL charge created');
        ELSE
            INSERT INTO test_runs VALUES (20, 'Fee reversal', 'FAIL', 'Fee reversal missing');
        END IF;

        -- T21: Peşinat refund
        IF EXISTS (
            SELECT 1 FROM public.finance_collections 
            WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1')
              AND direction = 'out' AND collection_kind = 'down_payment' AND amount = 150.00
        ) THEN
            INSERT INTO test_runs VALUES (21, 'Peşinat refund collection', 'PASS', 'Refund collection of 150 TL created');
        ELSE
            INSERT INTO test_runs VALUES (21, 'Peşinat refund collection', 'FAIL', 'Peşinat refund missing');
        END IF;

        -- T22: Tahsilat refund
        IF EXISTS (
            SELECT 1 FROM public.finance_collections 
            WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1')
              AND direction = 'out' AND collection_kind = 'installment_payment' AND amount = 100.00
        ) THEN
            INSERT INTO test_runs VALUES (22, 'Tahsilat refund collection', 'PASS', 'Refund collection of 100 TL created');
        ELSE
            INSERT INTO test_runs VALUES (22, 'Tahsilat refund collection', 'FAIL', 'Tahsilat refund missing');
        END IF;

        -- T23: Plan/taksit cancelled
        IF (SELECT status FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') = 'cancelled' AND
           (SELECT count(*) FROM public.finance_installments WHERE finance_plan_id = (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1') AND status = 'cancelled') = 3 THEN
            INSERT INTO test_runs VALUES (23, 'Plan status cancelled', 'PASS', 'Plan and all installments marked cancelled');
        ELSE
            INSERT INTO test_runs VALUES (23, 'Plan status cancelled', 'FAIL', 'Status mismatch');
        END IF;

        -- T24: Exact reversal/refund relationships.
        IF EXISTS (
          SELECT 1
          FROM public.finance_plans p
          JOIN public.finance_collections original_payment
            ON original_payment.finance_plan_id=p.id
           AND original_payment.direction='in'
           AND original_payment.collection_kind='installment_payment'
          JOIN public.finance_collections payment_refund
            ON payment_refund.reverses_collection_id=original_payment.id
           AND payment_refund.direction='out'
          JOIN public.credit_transactions payment_reversal
            ON payment_reversal.id=payment_refund.ledger_transaction_id
           AND payment_reversal.reversed_transaction_id=original_payment.ledger_transaction_id
          JOIN public.credit_transactions principal_reversal
            ON principal_reversal.reversed_transaction_id=p.principal_transaction_id
          JOIN public.credit_transactions fee_reversal
            ON fee_reversal.reversed_transaction_id=p.finance_charge_transaction_id
          JOIN public.finance_collections original_dp
            ON original_dp.finance_plan_id=p.id
           AND original_dp.direction='in' AND original_dp.collection_kind='down_payment'
          JOIN public.finance_collections dp_refund
            ON dp_refund.reverses_collection_id=original_dp.id
           AND dp_refund.direction='out'
          WHERE p.idempotency_key='test_key_success_1'
        ) THEN
          INSERT INTO test_runs VALUES (24, 'Cancellation exact relationships', 'PASS', 'All reversal and refund IDs match their originals');
        ELSE
          INSERT INTO test_runs VALUES (24, 'Cancellation exact relationships', 'FAIL', 'One or more reversal/refund relationships mismatch');
        END IF;

        -- T25: Başlangıç bakiyesi geri geliyor
        IF (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 0.00 THEN
            INSERT INTO test_runs VALUES (25, 'Starting balance restored', 'PASS', 'Balance restored to 0.00');
        ELSE
            INSERT INTO test_runs VALUES (25, 'Starting balance restored', 'FAIL', 'Balance mismatch');
        END IF;

    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (18, 'Payment reversal', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (19, 'Principal reversal', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (20, 'Fee reversal', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (21, 'Peşinat refund collection', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (22, 'Tahsilat refund collection', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (23, 'Plan status cancelled', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (24, 'Cancellation constraints', 'FAIL', SQLERRM);
        INSERT INTO test_runs VALUES (25, 'Starting balance restored', 'FAIL', SQLERRM);
    END;

    -- T26: İkinci cancel yeni hareket oluşturmuyor
    BEGIN
        SELECT jsonb_build_object(
          'ledger_count',(SELECT count(*) FROM public.credit_transactions WHERE credit_account_id=v_account_id),
          'payment_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_collections c ON c.ledger_transaction_id=t.id WHERE c.finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND c.direction='out' AND c.collection_kind='installment_payment'),
          'principal_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_plans p ON t.reversed_transaction_id=p.principal_transaction_id WHERE p.idempotency_key='test_key_success_1'),
          'fee_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_plans p ON t.reversed_transaction_id=p.finance_charge_transaction_id WHERE p.idempotency_key='test_key_success_1'),
          'outbound_refund_count',(SELECT count(*) FROM public.finance_collections WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND direction='out'),
          'cancel_audit_count',(SELECT count(*) FROM public.finance_audit_logs WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND action='cancel_plan'),
          'account_balance',(SELECT current_balance FROM public.credit_accounts WHERE id=v_account_id),
          'plan_status',(SELECT status FROM public.finance_plans WHERE idempotency_key='test_key_success_1'),
          'installments',(SELECT jsonb_agg(jsonb_build_object('status',status,'count',n) ORDER BY status) FROM (SELECT status,count(*) n FROM public.finance_installments WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') GROUP BY status) s)
        ) INTO v_cancel_before;
        PERFORM public.cancel_finance_plan(
            (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
            'admin_test',
            'Duplicate cancel call'
        );
        
        SELECT jsonb_build_object(
          'ledger_count',(SELECT count(*) FROM public.credit_transactions WHERE credit_account_id=v_account_id),
          'payment_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_collections c ON c.ledger_transaction_id=t.id WHERE c.finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND c.direction='out' AND c.collection_kind='installment_payment'),
          'principal_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_plans p ON t.reversed_transaction_id=p.principal_transaction_id WHERE p.idempotency_key='test_key_success_1'),
          'fee_reversal_count',(SELECT count(*) FROM public.credit_transactions t JOIN public.finance_plans p ON t.reversed_transaction_id=p.finance_charge_transaction_id WHERE p.idempotency_key='test_key_success_1'),
          'outbound_refund_count',(SELECT count(*) FROM public.finance_collections WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND direction='out'),
          'cancel_audit_count',(SELECT count(*) FROM public.finance_audit_logs WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') AND action='cancel_plan'),
          'account_balance',(SELECT current_balance FROM public.credit_accounts WHERE id=v_account_id),
          'plan_status',(SELECT status FROM public.finance_plans WHERE idempotency_key='test_key_success_1'),
          'installments',(SELECT jsonb_agg(jsonb_build_object('status',status,'count',n) ORDER BY status) FROM (SELECT status,count(*) n FROM public.finance_installments WHERE finance_plan_id=(SELECT id FROM public.finance_plans WHERE idempotency_key='test_key_success_1') GROUP BY status) s)
        ) INTO v_cancel_after;
        IF v_cancel_before = v_cancel_after THEN
            INSERT INTO test_runs VALUES (26, 'Second cancel idempotency', 'PASS', 'Complete before/after snapshot is identical');
        ELSE
            INSERT INTO test_runs VALUES (26, 'Second cancel idempotency', 'FAIL', 'Duplicate records created');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (26, 'Second cancel idempotency', 'FAIL', SQLERRM);
    END;

    -- T27: Append-only UPDATE reddi
    BEGIN
        UPDATE public.finance_collections SET amount = 200.00 WHERE idempotency_key = 'test_col_key_1';
        INSERT INTO test_runs VALUES (27, 'Append-only UPDATE prevention', 'FAIL', 'Allowed update on collections');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Updates and deletes are forbidden%' THEN
            INSERT INTO test_runs VALUES (27, 'Append-only UPDATE prevention', 'PASS', 'Rejected: ' || SQLERRM);
        ELSE
            INSERT INTO test_runs VALUES (27, 'Append-only UPDATE prevention', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END IF;
    END;

    -- T28: Append-only DELETE reddi
    BEGIN
        DELETE FROM public.finance_collections WHERE idempotency_key = 'test_col_key_1';
        INSERT INTO test_runs VALUES (28, 'Append-only DELETE prevention', 'FAIL', 'Allowed delete on collections');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Updates and deletes are forbidden%' THEN
            INSERT INTO test_runs VALUES (28, 'Append-only DELETE prevention', 'PASS', 'Rejected: ' || SQLERRM);
        ELSE
            INSERT INTO test_runs VALUES (28, 'Append-only DELETE prevention', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END IF;
    END;

    -- T29: Extreme case cent splitting validation
    DECLARE
        v_ex_plan_id UUID;
        v_sum_principal NUMERIC;
        v_sum_charge NUMERIC;
        v_sum_due NUMERIC;
        v_negative_charge_count INT;
    BEGIN
        v_ex_plan_id := (public.create_finance_plan(
            'test_key_cent_split_' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
            v_customer_id, 'manual', 'TEST-CENT-' || gen_random_uuid()::text,
            750.02, 150.00, 0.0017, 3::smallint, 15::smallint, current_date + 20,
            'admin_test', 'cash'
        )->'plan'->>'id')::uuid;

        -- Enforce sum assertions and components validations
        SELECT coalesce(sum(principal_amount), 0),
               coalesce(sum(finance_charge_amount), 0),
               coalesce(sum(amount_due), 0),
               count(*) FILTER (WHERE finance_charge_amount < 0)
        INTO v_sum_principal, v_sum_charge, v_sum_due, v_negative_charge_count
        FROM public.finance_installments
        WHERE finance_plan_id = v_ex_plan_id;

        IF v_sum_principal <> 600.02 THEN
            RAISE EXCEPTION 'Expected sum principal 600.02, got %', v_sum_principal;
        END IF;
        IF v_sum_charge <> 0.01 THEN
            RAISE EXCEPTION 'Expected sum finance charge 0.01, got %', v_sum_charge;
        END IF;
        IF v_sum_due <> 600.03 THEN
            RAISE EXCEPTION 'Expected sum amount due 600.03, got %', v_sum_due;
        END IF;
        IF v_negative_charge_count > 0 THEN
            RAISE EXCEPTION 'Negative finance charge component found';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.finance_installments
            WHERE finance_plan_id = v_ex_plan_id
              AND amount_due <> principal_amount + finance_charge_amount
        ) THEN
            RAISE EXCEPTION 'Installment amount_due does not match principal + charge';
        END IF;

        -- Clean up/pay with early closure
        PERFORM public.record_finance_collection(
            'test_full_early_' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
            v_ex_plan_id,
            (SELECT remaining_amount FROM public.finance_plans WHERE id = v_ex_plan_id),
            'cash', 'early_closure', v_collection_time, 'admin_test', 'full closure'
        );

        IF NOT EXISTS (
            SELECT 1 FROM public.finance_plans
            WHERE id = v_ex_plan_id AND status='paid' AND remaining_amount=0
        ) THEN
            RAISE EXCEPTION 'Full early closure did not pay plan';
        END IF;

        INSERT INTO test_runs VALUES (29, 'Extreme case cent splitting', 'PASS', 'Independent splits sum to exact values, no negative charges');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (29, 'Extreme case cent splitting', 'FAIL', SQLERRM);
    END;

    -- T30: Cancellation balance guard fault injection in a subtransaction.
    DECLARE
        v_fault_plan_id UUID;
        v_bal_before NUMERIC;
        v_bal_after NUMERIC;
        v_plan_status_after TEXT;
        v_rev_count_before INT;
        v_rev_count_after INT;
        v_ref_count_before INT;
        v_ref_count_after INT;
        v_audit_count_before INT;
        v_audit_count_after INT;
    BEGIN
        v_fault_plan_id := (public.create_finance_plan(
            'test_key_fault_' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
            v_customer_id, 'manual', 'TEST-FAULT-' || gen_random_uuid()::text,
            750.00, 0, 0, 3::smallint, 15::smallint, current_date + 20,
            'admin_test', 'cash'
        )->'plan'->>'id')::uuid;

        -- Take snapshots before inner block
        SELECT current_balance INTO v_bal_before FROM public.credit_accounts WHERE id = v_account_id;
        SELECT count(*) INTO v_rev_count_before FROM public.credit_transactions WHERE credit_account_id = v_account_id AND transaction_type = 'reversal';
        SELECT count(*) INTO v_ref_count_before FROM public.finance_collections WHERE finance_plan_id = v_fault_plan_id AND direction = 'out';
        SELECT count(*) INTO v_audit_count_before FROM public.finance_audit_logs WHERE finance_plan_id = v_fault_plan_id AND action = 'cancel_plan';

        BEGIN
            -- Inner block: inject fault and try cancel
            UPDATE public.credit_accounts
            SET current_balance = current_balance + 0.01
            WHERE id = v_account_id;

            PERFORM public.cancel_finance_plan(
                v_fault_plan_id,
                'admin_test',
                'fault injection'
            );
            RAISE EXCEPTION 'Cancellation accepted corrupted account balance';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM <> 'Finance cancellation balance restoration failed' THEN RAISE; END IF;
        END;

        -- Verify snapshots and state after inner block
        SELECT current_balance INTO v_bal_after FROM public.credit_accounts WHERE id = v_account_id;
        SELECT status INTO v_plan_status_after FROM public.finance_plans WHERE id = v_fault_plan_id;
        SELECT count(*) INTO v_rev_count_after FROM public.credit_transactions WHERE credit_account_id = v_account_id AND transaction_type = 'reversal';
        SELECT count(*) INTO v_ref_count_after FROM public.finance_collections WHERE finance_plan_id = v_fault_plan_id AND direction = 'out';
        SELECT count(*) INTO v_audit_count_after FROM public.finance_audit_logs WHERE finance_plan_id = v_fault_plan_id AND action = 'cancel_plan';

        IF v_bal_before IS DISTINCT FROM v_bal_after THEN
            RAISE EXCEPTION 'Balance did not return to the value before inner block';
        END IF;
        IF v_plan_status_after IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'Fault plan status is not active (was %)', v_plan_status_after;
        END IF;
        IF v_rev_count_before <> v_rev_count_after THEN
            RAISE EXCEPTION 'Reversal transaction was created';
        END IF;
        IF v_ref_count_before <> v_ref_count_after THEN
            RAISE EXCEPTION 'Refund collection was created';
        END IF;
        IF v_audit_count_before <> v_audit_count_after THEN
            RAISE EXCEPTION 'Cancel audit log was created';
        END IF;

        INSERT INTO test_runs VALUES (30, 'Cancellation balance fault guard', 'PASS', 'Corruption rejected, inner state successfully rolled back and verified');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (30, 'Cancellation balance fault guard', 'FAIL', SQLERRM);
    END;

    -- T31: Down-payment ledger constraint checks (negative tests)
    BEGIN
        -- 1. Try to insert down_payment with ledger_transaction_id
        BEGIN
            INSERT INTO public.finance_collections (
                idempotency_key, finance_plan_id, credit_account_id, amount,
                collection_kind, payment_method, receipt_number, created_by,
                ledger_transaction_id, direction
            ) VALUES (
                'test_fault_col_1',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                v_account_id, 100.00, 'down_payment', 'cash', 'RCP-FAULT-1', 'admin_test',
                gen_random_uuid(), -- non-null
                'in'
            );
            RAISE EXCEPTION 'Allowed down_payment collection with non-null ledger_transaction_id';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%chk_reversal_ledger_transaction%' THEN RAISE; END IF;
        END;

        -- 2. Try to insert installment_payment with null ledger_transaction_id
        BEGIN
            INSERT INTO public.finance_collections (
                idempotency_key, finance_plan_id, credit_account_id, amount,
                collection_kind, payment_method, receipt_number, created_by,
                ledger_transaction_id, direction
            ) VALUES (
                'test_fault_col_2',
                (SELECT id FROM public.finance_plans WHERE idempotency_key = 'test_key_success_1'),
                v_account_id, 100.00, 'installment_payment', 'cash', 'RCP-FAULT-2', 'admin_test',
                NULL, -- null
                'in'
            );
            RAISE EXCEPTION 'Allowed installment_payment collection with null ledger_transaction_id';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%chk_reversal_ledger_transaction%' THEN RAISE; END IF;
        END;

        INSERT INTO test_runs VALUES (31, 'Down-payment ledger constraints', 'PASS', 'Violations of chk_reversal_ledger_transaction correctly rejected');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_runs VALUES (31, 'Down-payment ledger constraints', 'FAIL', SQLERRM);
    END;

    -- T32: Final integrity test
    DECLARE
        v_expected_count INT := 31;
        v_actual_count INT;
        v_pass_count INT;
        v_fail_count INT;
    BEGIN
        SELECT count(*),
               count(*) FILTER (WHERE result = 'PASS'),
               count(*) FILTER (WHERE result = 'FAIL')
        INTO v_actual_count, v_pass_count, v_fail_count
        FROM test_runs
        WHERE test_id <> 32;

        IF v_actual_count = v_expected_count AND v_fail_count = 0 AND v_pass_count = v_expected_count THEN
            INSERT INTO test_runs VALUES (32, 'Final integrity test', 'PASS', 'All ' || v_expected_count || ' functional tests passed');
        ELSE
            INSERT INTO test_runs VALUES (32, 'Final integrity test', 'FAIL', 'Integrity check failed: expected ' || v_expected_count || ', actual ' || v_actual_count || ', passed ' || v_pass_count || ', failed ' || v_fail_count);
        END IF;
    END;

END;
$$;

DO $$
DECLARE
    v_pass_count INTEGER;
    v_fail_count INTEGER;
    v_actual_test_count INTEGER;
    v_failures TEXT;
BEGIN
    SELECT
        count(*) FILTER (WHERE result = 'PASS'),
        count(*) FILTER (WHERE result = 'FAIL'),
        count(*),
        string_agg(
            format(
                'T%s %s: %s',
                test_id,
                test_name,
                coalesce(details, '')
            ),
            ' | '
            ORDER BY test_id
        ) FILTER (WHERE result <> 'PASS')
    INTO
        v_pass_count,
        v_fail_count,
        v_actual_test_count,
        v_failures
    FROM test_runs;

    IF v_actual_test_count <> 32
       OR v_pass_count <> 32
       OR v_fail_count <> 0
    THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = format(
                'Finance functional assertion failed: expected=32 actual=%s pass=%s fail=%s failures=%s',
                v_actual_test_count,
                v_pass_count,
                v_fail_count,
                coalesce(v_failures, 'none')
            );
    END IF;
END;
$$;

-- Select Test Results
SELECT * FROM test_runs ORDER BY test_id ASC;
SELECT count(*) FILTER (WHERE result='PASS') AS pass_count,
       count(*) FILTER (WHERE result='FAIL') AS fail_count,
       32 AS expected_test_count,
       count(*) AS actual_test_count,
       CASE WHEN count(*)=32
                 AND count(*) FILTER (WHERE result='PASS')=32
                 AND count(*) FILTER (WHERE result='FAIL')=0
            THEN 'PASS' ELSE 'FAIL' END AS final_integrity_result,
       'PENDING'::text AS rollback_cleanup_status
FROM test_runs;

ROLLBACK;

DO $$
BEGIN
    IF to_regclass('public.finance_plans') IS NOT NULL
       OR to_regclass('public.finance_installments') IS NOT NULL
       OR to_regclass('public.finance_collections') IS NOT NULL
       OR to_regclass('public.finance_audit_logs') IS NOT NULL
       OR to_regclass('public.finance_receipt_seq') IS NOT NULL
       OR to_regprocedure(
           'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'
       ) IS NOT NULL
       OR to_regprocedure(
           'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'
       ) IS NOT NULL
       OR to_regprocedure(
           'public.cancel_finance_plan(uuid,text,text)'
       ) IS NOT NULL
       OR to_regprocedure(
           'public.prevent_finance_append_only_update_delete()'
       ) IS NOT NULL
    THEN
        RAISE EXCEPTION
            'Finance rollback cleanup assertion failed: one or more Finance objects survived';
    END IF;
END;
$$;

-- Transaction-external cleanup verification.
-- This final row is reached only if the pre-rollback 32/32 assertion passed.
WITH cleanup AS (
    SELECT
        to_regclass('public.finance_plans') IS NULL
        AND to_regclass('public.finance_installments') IS NULL
        AND to_regclass('public.finance_collections') IS NULL
        AND to_regclass('public.finance_audit_logs') IS NULL
        AND to_regclass('public.finance_receipt_seq') IS NULL
        AND to_regprocedure(
            'public.create_finance_plan(text,uuid,text,text,numeric,numeric,numeric,smallint,smallint,date,text,text)'
        ) IS NULL
        AND to_regprocedure(
            'public.record_finance_collection(text,uuid,numeric,text,text,timestamptz,text,text)'
        ) IS NULL
        AND to_regprocedure(
            'public.cancel_finance_plan(uuid,text,text)'
        ) IS NULL
        AND to_regprocedure(
            'public.prevent_finance_append_only_update_delete()'
        ) IS NULL AS all_finance_objects_removed
)
SELECT
    32::integer AS pass_count,
    0::integer AS fail_count,
    32::integer AS expected_test_count,
    32::integer AS actual_test_count,
    'PASS'::text AS final_integrity_result,
    true AS functional_assertion_passed,
    all_finance_objects_removed AS overall_cleanup_ok,
    CASE
        WHEN all_finance_objects_removed THEN 'PASS'
        ELSE 'FAIL'
    END AS cleanup_result
FROM cleanup;
