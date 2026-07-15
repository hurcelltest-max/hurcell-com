-- Migration: 20260715090000_finance_installments_mvp.sql
-- Description: Finance MVP tables and RPC functions for installment management

-- Create Sequences
CREATE SEQUENCE IF NOT EXISTS public.finance_receipt_seq START 1;
REVOKE ALL ON SEQUENCE public.finance_receipt_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.finance_receipt_seq TO service_role;

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
    financed_principal NUMERIC(12,2) NOT NULL CHECK (financed_principal >= 0),
    term_rate_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (term_rate_percent >= 0),
    finance_charge_amount NUMERIC(12,2) NOT NULL CHECK (finance_charge_amount >= 0),
    total_due_amount NUMERIC(12,2) NOT NULL CHECK (total_due_amount >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC(12,2) NOT NULL CHECK (remaining_amount >= 0),
    installment_count SMALLINT NOT NULL CHECK (installment_count BETWEEN 1 AND 3),
    statement_day SMALLINT NOT NULL CHECK (statement_day IN (10, 15, 20, 25)),
    first_due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'overdue', 'cancelled')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_financed_principal_calc CHECK (financed_principal = principal_amount - down_payment_amount),
    CONSTRAINT chk_down_payment_le_principal CHECK (down_payment_amount <= principal_amount),
    CONSTRAINT chk_total_due_calc CHECK (total_due_amount = financed_principal + finance_charge_amount),
    CONSTRAINT chk_remaining_calc CHECK (remaining_amount = total_due_amount - amount_paid)
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
    UNIQUE(finance_plan_id, installment_no)
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
    collection_kind TEXT NOT NULL CHECK (collection_kind IN ('down_payment', 'installment_payment', 'early_closure', 'adjustment')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other')),
    receipt_number TEXT UNIQUE NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_collections_plan ON public.finance_collections(finance_plan_id);

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

-- Enable RLS
ALTER TABLE public.finance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from PUBLIC, anon, authenticated roles
REVOKE ALL ON TABLE public.finance_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_installments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_collections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_audit_logs FROM PUBLIC, anon, authenticated;

-- Grant permissions to service_role
GRANT ALL ON TABLE public.finance_plans TO service_role;
GRANT ALL ON TABLE public.finance_installments TO service_role;
GRANT ALL ON TABLE public.finance_collections TO service_role;
GRANT ALL ON TABLE public.finance_audit_logs TO service_role;

-- Policies
CREATE POLICY service_role_all ON public.finance_plans FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON public.finance_installments FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON public.finance_collections FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON public.finance_audit_logs FOR ALL TO service_role USING (true);

-- Triggers to prevent updates/deletes on append-only tables
CREATE OR REPLACE FUNCTION public.prevent_finance_append_only_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Updates and Deletes are strictly forbidden on table: %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_collections_modifications
BEFORE UPDATE OR DELETE ON public.finance_collections
FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_append_only_update_delete();

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
    p_created_by TEXT
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
    
    v_total_cents INT;
    v_base_cents INT;
    v_last_cents INT;
    v_base_principal_cents INT;
    v_last_principal_cents INT;
    v_base_charge_cents INT;
    v_last_charge_cents INT;
    
    v_financed_principal_cents INT;
    v_finance_charge_cents INT;
    
    v_inst_due_date DATE;
    v_ledger_res JSONB;
    v_dp_receipt TEXT;
    
    v_existing_plan RECORD;
    v_existing_inst JSONB;
    v_existing_balance NUMERIC;
BEGIN
    -- Idempotency Check
    SELECT * INTO v_existing_plan FROM public.finance_plans WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        SELECT json_agg(i) INTO v_existing_inst FROM public.finance_installments i WHERE finance_plan_id = v_existing_plan.id;
        SELECT current_balance INTO v_existing_balance FROM public.credit_accounts WHERE id = v_existing_plan.credit_account_id;
        RETURN jsonb_build_object(
            'plan', to_jsonb(v_existing_plan),
            'installments', v_existing_inst,
            'current_balance', v_existing_balance
        );
    END IF;

    -- Validations
    IF p_principal_amount < 750 THEN
        RAISE EXCEPTION 'Principal amount must be at least 750';
    END IF;
    IF p_down_payment_amount < 0 THEN
        RAISE EXCEPTION 'Down payment cannot be negative';
    END IF;
    IF p_down_payment_amount > p_principal_amount THEN
        RAISE EXCEPTION 'Down payment cannot exceed principal amount';
    END IF;
    IF p_installment_count NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Installment count must be between 1 and 3';
    END IF;
    IF p_statement_day NOT IN (10, 15, 20, 25) THEN
        RAISE EXCEPTION 'Statement day must be 10, 15, 20, or 25';
    END IF;

    -- Row Lock Customer & Account
    SELECT status INTO v_customer_status FROM public.credit_customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_customer_status NOT IN ('approved', 'active') THEN
        RAISE EXCEPTION 'Customer is not approved or active';
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

    -- Limit Check
    IF v_current_balance + v_total_due > v_credit_limit THEN
        RAISE EXCEPTION 'Kullanılabilir limit yetersiz. Mevcut Bakiye: %, Limit: %, Talep: %', v_current_balance, v_credit_limit, v_total_due;
    END IF;

    -- Update Balance
    UPDATE public.credit_accounts SET current_balance = current_balance + v_total_due, updated_at = now() WHERE id = v_account_id RETURNING current_balance INTO v_new_balance;

    -- Insert Plan
    INSERT INTO public.finance_plans (
        idempotency_key, credit_customer_id, credit_account_id, source_type, source_reference,
        principal_amount, down_payment_amount, financed_principal, term_rate_percent,
        finance_charge_amount, total_due_amount, amount_paid, remaining_amount,
        installment_count, statement_day, first_due_date, status, created_by
    ) VALUES (
        p_idempotency_key, p_customer_id, v_account_id, p_source_type, p_source_reference,
        p_principal_amount, p_down_payment_amount, v_financed_principal, p_term_rate_percent,
        v_finance_charge, v_total_due, 0, v_total_due,
        p_installment_count, p_statement_day, p_first_due_date, 'active', p_created_by
    ) RETURNING id INTO v_plan_id;

    -- Insert Ledger Transactions (Using the existing credit ledger)
    PERFORM public.add_credit_transaction(
        p_customer_id, v_account_id, 'purchase', 'debit', v_financed_principal,
        'Taksitli Satış Borcu - Ref: ' || p_source_reference,
        CASE WHEN p_source_type IN ('store_sale', 'web_order') THEN p_source_type ELSE 'store_sale' END,
        p_source_reference, NULL, NULL, p_created_by, NULL, NULL
    );

    IF v_finance_charge > 0 THEN
        PERFORM public.add_credit_transaction(
            p_customer_id, v_account_id, 'fee', 'debit', v_finance_charge,
            'Taksit Vade Farkı Bedeli - Ref: ' || p_source_reference,
            'service_fee', p_source_reference, NULL, NULL, p_created_by, NULL, NULL
        );
    END IF;

    -- Insert Down Payment if exists
    IF p_down_payment_amount > 0 THEN
        v_dp_receipt := 'RCP-DP-' || LPAD(nextval('public.finance_receipt_seq')::text, 6, '0');
        INSERT INTO public.finance_collections (
            idempotency_key, finance_plan_id, credit_account_id, amount,
            collection_kind, payment_method, receipt_number, created_by, note
        ) VALUES (
            p_idempotency_key || '_down_payment', v_plan_id, v_account_id, p_down_payment_amount,
            'down_payment', 'cash', v_dp_receipt, p_created_by, 'Peşinat tahsilatı'
        );
    END IF;

    -- Split Installments (Cents level to avoid floating point issues, kuruş farkı son taksite)
    v_total_cents := round(v_total_due * 100);
    v_base_cents := v_total_cents / p_installment_count;
    v_last_cents := v_total_cents - (v_base_cents * (p_installment_count - 1));

    v_financed_principal_cents := round(v_financed_principal * 100);
    v_base_principal_cents := v_financed_principal_cents / p_installment_count;
    v_last_principal_cents := v_financed_principal_cents - (v_base_principal_cents * (p_installment_count - 1));

    v_finance_charge_cents := round(v_finance_charge * 100);
    v_base_charge_cents := v_finance_charge_cents / p_installment_count;
    v_last_charge_cents := v_finance_charge_cents - (v_base_charge_cents * (p_installment_count - 1));

    FOR i IN 1..p_installment_count LOOP
        v_inst_due_date := (p_first_due_date + (i - 1) * INTERVAL '1 month')::DATE;
        
        INSERT INTO public.finance_installments (
            finance_plan_id, installment_no, due_date, principal_amount,
            finance_charge_amount, amount_due, amount_paid, remaining_amount, status
        ) VALUES (
            v_plan_id, i, v_inst_due_date,
            CASE WHEN i = p_installment_count THEN v_last_principal_cents::numeric / 100.0 ELSE v_base_principal_cents::numeric / 100.0 END,
            CASE WHEN i = p_installment_count THEN v_last_charge_cents::numeric / 100.0 ELSE v_base_charge_cents::numeric / 100.0 END,
            CASE WHEN i = p_installment_count THEN v_last_cents::numeric / 100.0 ELSE v_base_cents::numeric / 100.0 END,
            0,
            CASE WHEN i = p_installment_count THEN v_last_cents::numeric / 100.0 ELSE v_base_cents::numeric / 100.0 END,
            'pending'
        );
    END LOOP;

    -- Audit Log
    INSERT INTO public.finance_audit_logs (finance_plan_id, action, actor, old_data, new_data)
    VALUES (v_plan_id, 'create_plan', p_created_by, NULL, jsonb_build_object('principal', p_principal_amount, 'total_due', v_total_due));

    -- Return JSONB
    RETURN jsonb_build_object(
        'plan', (SELECT to_jsonb(p) FROM public.finance_plans p WHERE id = v_plan_id),
        'installments', (SELECT json_agg(i) FROM public.finance_installments i WHERE finance_plan_id = v_plan_id),
        'current_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT) TO service_role;

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
BEGIN
    -- Idempotency Check
    SELECT * INTO v_existing_col FROM public.finance_collections WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
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

    -- Validations
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
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

    SELECT current_balance, credit_customer_id INTO v_current_balance, v_customer_id
    FROM public.credit_accounts WHERE id = v_account_id FOR UPDATE;

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

    -- Update Plan
    UPDATE public.finance_plans SET
        amount_paid = amount_paid + p_amount,
        remaining_amount = remaining_amount - p_amount,
        status = CASE WHEN remaining_amount - p_amount = 0 THEN 'paid'::text ELSE status END,
        updated_at = now()
    WHERE id = p_plan_id;

    -- Deduct Account Balance
    UPDATE public.credit_accounts SET current_balance = current_balance - p_amount, updated_at = now()
    WHERE id = v_account_id RETURNING current_balance INTO v_new_balance;

    -- Insert Receipt
    v_receipt_number := 'RCP-COL-' || LPAD(nextval('public.finance_receipt_seq')::text, 6, '0');
    INSERT INTO public.finance_collections (
        idempotency_key, finance_plan_id, credit_account_id, amount,
        collection_kind, payment_method, receipt_number, collected_at, created_by, note
    ) VALUES (
        p_idempotency_key, p_plan_id, v_account_id, p_amount,
        p_collection_kind, p_payment_method, v_receipt_number, p_collected_at, p_created_by, p_note
    ) RETURNING id INTO v_collection_id;

    -- Insert Ledger Transaction
    PERFORM public.add_credit_transaction(
        v_customer_id, v_account_id, 'payment', 'credit', p_amount,
        'Taksit Tahsilatı - Makbuz No: ' || v_receipt_number,
        'payment', v_receipt_number, NULL, p_payment_method, p_created_by, NULL, NULL
    );

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
BEGIN
    p_reason := trim(p_reason);
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Reason is required for cancelling finance plans';
    END IF;

    -- Lock Plan & Account
    SELECT credit_account_id, amount_paid, total_due_amount, financed_principal, finance_charge_amount, source_reference, status
    INTO v_account_id, v_amount_paid, v_total_due, v_financed_principal, v_finance_charge, v_source_reference, v_status
    FROM public.finance_plans WHERE id = p_plan_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finance plan not found';
    END IF;
    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'Finance plan is already cancelled';
    END IF;
    IF v_amount_paid > 0 THEN
        RAISE EXCEPTION 'Ödemesi başlamış taksit planları iptal edilemez. Lütfen manuel finans incelemesine yönlendirin.';
    END IF;

    SELECT current_balance, credit_customer_id INTO v_current_balance, v_customer_id
    FROM public.credit_accounts WHERE id = v_account_id FOR UPDATE;

    -- Update statuses
    UPDATE public.finance_plans SET status = 'cancelled', remaining_amount = 0, updated_at = now() WHERE id = p_plan_id;
    UPDATE public.finance_installments SET status = 'cancelled', remaining_amount = 0, updated_at = now() WHERE finance_plan_id = p_plan_id;

    -- Deduct Balance
    UPDATE public.credit_accounts SET current_balance = current_balance - v_total_due, updated_at = now()
    WHERE id = v_account_id RETURNING current_balance INTO v_new_balance;

    -- Insert Reversal Transactions
    PERFORM public.add_credit_transaction(
        v_customer_id, v_account_id, 'reversal', 'credit', v_financed_principal,
        'Taksitli Plan İptali (Borç İadesi) - Ref: ' || v_source_reference,
        'reversal', v_source_reference, NULL, NULL, p_admin_username, NULL, NULL
    );

    IF v_finance_charge > 0 THEN
        PERFORM public.add_credit_transaction(
            v_customer_id, v_account_id, 'reversal', 'credit', v_finance_charge,
            'Taksitli Plan İptali (Vade Farkı İadesi) - Ref: ' || v_source_reference,
            'reversal', v_source_reference, NULL, NULL, p_admin_username, NULL, NULL
        );
    END IF;

    -- Audit Log
    INSERT INTO public.finance_audit_logs (finance_plan_id, action, actor, old_data, new_data, reason)
    VALUES (p_plan_id, 'cancel_plan', p_admin_username, 
            jsonb_build_object('status', v_status, 'total_due', v_total_due), 
            jsonb_build_object('status', 'cancelled', 'total_due', 0), p_reason);

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
