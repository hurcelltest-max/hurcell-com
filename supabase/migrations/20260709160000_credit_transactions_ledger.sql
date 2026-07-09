-- Phase 1.8A Credit Transactions Ledger
-- Production DB was manually applied and verified on 2026-07-09.
-- This migration is added for repository tracking and future environment consistency.
-- Do not re-run against production without explicit review.

-- 1. credit_audit_logs credit_account_id / old_value güvenli ekleme
ALTER TABLE public.credit_audit_logs ADD COLUMN IF NOT EXISTS credit_account_id UUID;
ALTER TABLE public.credit_audit_logs ADD COLUMN IF NOT EXISTS old_value JSONB;

-- 2. fk_credit_audit_logs_account
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_audit_logs_account' AND conrelid = 'public.credit_audit_logs'::regclass) THEN
        ALTER TABLE public.credit_audit_logs 
        ADD CONSTRAINT fk_credit_audit_logs_account FOREIGN KEY (credit_account_id) 
        REFERENCES public.credit_accounts(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_credit_audit_logs_account_id ON public.credit_audit_logs(credit_account_id);

-- 3. credit_transaction_code_seq
CREATE SEQUENCE IF NOT EXISTS public.credit_transaction_code_seq START 1;

-- 4. credit_transactions tablosu
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_no BIGSERIAL NOT NULL UNIQUE, -- 5. ledger_no BIGSERIAL
    transaction_code TEXT UNIQUE NOT NULL, -- 6. transaction_code unique
    credit_customer_id UUID NOT NULL,
    credit_account_id UUID NOT NULL,
    transaction_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_reference TEXT,
    external_url TEXT,
    payment_method TEXT,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    admin_username TEXT NOT NULL,
    reversed_transaction_id UUID,
    balance_after NUMERIC(10, 2) NOT NULL,
    metadata JSONB,
    CONSTRAINT fk_credit_transactions_customer FOREIGN KEY (credit_customer_id) REFERENCES public.credit_customers(id),
    CONSTRAINT fk_credit_transactions_account FOREIGN KEY (credit_account_id) REFERENCES public.credit_accounts(id),
    CONSTRAINT fk_credit_transactions_reversed_transaction FOREIGN KEY (reversed_transaction_id) REFERENCES public.credit_transactions(id)
);

-- 9. account/customer/ledger/date/reversal index'leri
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account ON public.credit_transactions(credit_account_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer ON public.credit_transactions(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_ledger ON public.credit_transactions(ledger_no);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_date ON public.credit_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_ledger_desc ON public.credit_transactions(credit_account_id, ledger_no DESC);

-- 10. uniq_credit_transactions_reversed_once partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_transactions_reversed_once ON public.credit_transactions(reversed_transaction_id) WHERE reversed_transaction_id IS NOT NULL;

-- 7. tüm tabloya özel CHECK constraint'ler
DO $$ BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_amount_positive' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_amount_positive CHECK (amount > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_transaction_type' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_transaction_type CHECK (
            transaction_type IN ('purchase', 'fee', 'payment', 'adjustment', 'reversal')
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_direction' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_direction CHECK (direction IN ('debit', 'credit'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_source_type' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_source_type CHECK (
            source_type IN ('web_order', 'store_sale', 'service_fee', 'print_fee', 'technical_service_fee', 'payment', 'adjustment', 'reversal')
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_payment_method' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_payment_method CHECK (
            payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank_transfer', 'other')
        );
    END IF;

    -- 8. balance_after >= 0 constraint'i
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_transactions_balance_after_non_negative' AND conrelid = 'public.credit_transactions'::regclass) THEN
        ALTER TABLE public.credit_transactions ADD CONSTRAINT chk_credit_transactions_balance_after_non_negative CHECK (balance_after >= 0);
    END IF;
END $$;

-- 11. append-only trigger function ve trigger
CREATE OR REPLACE FUNCTION public.prevent_credit_transactions_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'credit_transactions records are append-only and cannot be modified or deleted. Use reversal or adjustment instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_credit_transactions_update_delete ON public.credit_transactions;
CREATE TRIGGER trg_prevent_credit_transactions_update_delete
BEFORE UPDATE OR DELETE ON public.credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_transactions_modification();

-- 12. final add_credit_transaction RPC
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
    IF p_source_type NOT IN ('web_order', 'store_sale', 'service_fee', 'print_fee', 'technical_service_fee', 'payment', 'adjustment', 'reversal') THEN RAISE EXCEPTION 'Invalid source_type'; END IF;

    -- Yön/Tip ve Kaynak Uyumluluğu Enforce
    IF p_transaction_type = 'payment' THEN
        IF p_direction != 'credit' OR p_source_type != 'payment' THEN RAISE EXCEPTION 'Payment transactions must be credit direction and payment source_type'; END IF;
        IF p_payment_method IS NULL OR p_payment_method = '' THEN RAISE EXCEPTION 'Payment method is required for payments'; END IF;
        IF p_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'other') THEN RAISE EXCEPTION 'Invalid payment_method'; END IF;
    ELSE
        p_payment_method := NULL;
    END IF;

    IF p_transaction_type = 'purchase' THEN
        IF p_direction != 'debit' THEN RAISE EXCEPTION 'Purchase transactions must be debit direction'; END IF;
        IF p_source_type NOT IN ('web_order', 'store_sale') THEN RAISE EXCEPTION 'Purchase source_type must be web_order or store_sale'; END IF;
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

-- 13. RLS enable
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 16. table grants/revokes
REVOKE ALL ON public.credit_transactions FROM public, anon, authenticated;

-- 14. service_role sadece SELECT policy
GRANT SELECT ON public.credit_transactions TO service_role;

DROP POLICY IF EXISTS "service_role_select" ON public.credit_transactions;
CREATE POLICY "service_role_select" ON public.credit_transactions FOR SELECT TO service_role USING (true);
-- 15. direct INSERT policy yok

-- 17. sequence revokes
REVOKE ALL ON SEQUENCE public.credit_transaction_code_seq FROM public, anon, authenticated;
REVOKE ALL ON SEQUENCE public.credit_transactions_ledger_no_seq FROM public, anon, authenticated;

-- 18. RPC grant/revoke
REVOKE ALL ON FUNCTION public.add_credit_transaction(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credit_transaction(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO service_role;
