-- 1. Mevcut credit_audit_logs Tablosunu Genişletme
ALTER TABLE public.credit_audit_logs 
  ADD COLUMN IF NOT EXISTS credit_customer_id UUID,
  ADD COLUMN IF NOT EXISTS admin_username VARCHAR(255);

-- 2. Idempotent FK ve Index Ekleme
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'credit_audit_logs_customer_fk' 
      AND conrelid = 'public.credit_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.credit_audit_logs 
      ADD CONSTRAINT credit_audit_logs_customer_fk 
      FOREIGN KEY (credit_customer_id) REFERENCES public.credit_customers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_credit_audit_logs_customer_id ON public.credit_audit_logs(credit_customer_id);

-- 3. CHECK Constraint Güncellemeleri
ALTER TABLE public.credit_customers DROP CONSTRAINT IF EXISTS credit_customers_status_check;
ALTER TABLE public.credit_customers ADD CONSTRAINT credit_customers_status_check 
  CHECK (status IN ('pending_review', 'active', 'rejected', 'suspended', 'blacklisted'));

ALTER TABLE public.credit_accounts DROP CONSTRAINT IF EXISTS credit_accounts_status_check;
ALTER TABLE public.credit_accounts ADD CONSTRAINT credit_accounts_status_check 
  CHECK (status IN ('pending_review', 'active', 'suspended', 'closed'));

-- 4. Default Değerlerin Güncellenmesi
ALTER TABLE public.credit_customers ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE public.credit_accounts ALTER COLUMN status SET DEFAULT 'pending_review';

-- 5. Atomik RPC Tanımlaması
CREATE OR REPLACE FUNCTION public.review_credit_application(
  p_customer_id UUID,
  p_decision VARCHAR,
  p_credit_limit NUMERIC,
  p_statement_day INT,
  p_reason TEXT,
  p_admin_username VARCHAR
) RETURNS void 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision VARCHAR := lower(trim(p_decision));
  v_reason TEXT := trim(p_reason);
  v_admin_username VARCHAR := trim(p_admin_username);
  
  v_account_count INT;
  v_acc_id UUID;
  v_old_cust_status VARCHAR;
  v_old_acc_status VARCHAR;
  v_old_limit NUMERIC;
  
  v_new_cust_status VARCHAR;
  v_new_acc_status VARCHAR;
  v_final_limit NUMERIC := p_credit_limit;
BEGIN
  -- Temel Validasyonlar
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'Reason is required for credit application review.';
  END IF;

  IF v_admin_username IS NULL OR v_admin_username = '' THEN
    RAISE EXCEPTION 'Admin username is required for audit logs.';
  END IF;

  IF p_statement_day NOT IN (10, 15, 20, 25) THEN
    RAISE EXCEPTION 'Statement day must be 10, 15, 20, or 25.';
  END IF;

  -- Karara Bağlı Limit Validasyonu
  IF v_decision IN ('approve', 'suspend') THEN
    IF v_final_limit IS NULL OR v_final_limit < 0 THEN
      RAISE EXCEPTION 'Credit limit cannot be null or negative for approve/suspend decisions.';
    END IF;
  END IF;

  -- Müşteri Satır Kilitleme ve Kayıt Kontrolü (FOR UPDATE)
  SELECT status INTO v_old_cust_status 
  FROM public.credit_customers 
  WHERE id = p_customer_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  -- Duplicate Account Kontrolü
  SELECT COUNT(*)
  INTO v_account_count
  FROM public.credit_accounts
  WHERE credit_customer_id = p_customer_id;

  IF v_account_count = 0 THEN
    RAISE EXCEPTION 'Credit account not found for customer.';
  END IF;

  IF v_account_count > 1 THEN
    RAISE EXCEPTION 'Multiple credit accounts found for customer. Manual review required.';
  END IF;

  -- Hesap Satır Kilitleme (Artık tek olduğu garanti)
  SELECT id, status, credit_limit INTO v_acc_id, v_old_acc_status, v_old_limit 
  FROM public.credit_accounts 
  WHERE credit_customer_id = p_customer_id FOR UPDATE;
  
  -- Explicit Status Mapping
  IF v_decision = 'approve' THEN
    v_new_cust_status := 'active';
    v_new_acc_status := 'active';
  ELSIF v_decision = 'reject' THEN
    v_new_cust_status := 'rejected';
    v_new_acc_status := 'closed';
    v_final_limit := 0; -- Reject durumunda limit otomatik sıfırlanır
  ELSIF v_decision = 'suspend' THEN
    v_new_cust_status := 'suspended';
    v_new_acc_status := 'suspended';
  ELSE
    RAISE EXCEPTION 'Invalid decision. Allowed values: approve, reject, suspend.';
  END IF;

  -- Güncellemeler
  UPDATE public.credit_customers 
  SET status = v_new_cust_status, updated_at = now() 
  WHERE id = p_customer_id;

  UPDATE public.credit_accounts 
  SET status = v_new_acc_status, credit_limit = v_final_limit, statement_day = p_statement_day, updated_at = now() 
  WHERE id = v_acc_id;

  -- Aynı transaction içinde Audit Log
  INSERT INTO public.credit_audit_logs (
    credit_customer_id, 
    credit_account_id, 
    admin_username, 
    action_type, 
    old_value, 
    new_value, 
    reason
  )
  VALUES (
    p_customer_id, 
    v_acc_id,
    v_admin_username, 
    'application_review', 
    jsonb_build_object('cust_status', v_old_cust_status, 'acc_status', v_old_acc_status, 'limit', v_old_limit), 
    jsonb_build_object('cust_status', v_new_cust_status, 'acc_status', v_new_acc_status, 'limit', v_final_limit, 'decision', v_decision), 
    v_reason
  );
END;
$$ LANGUAGE plpgsql;

-- 6. RPC Yetki Ayarları (Sert Güvenlik)
REVOKE ALL ON FUNCTION public.review_credit_application(UUID, VARCHAR, NUMERIC, INT, TEXT, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_credit_application(UUID, VARCHAR, NUMERIC, INT, TEXT, VARCHAR) FROM anon;
REVOKE ALL ON FUNCTION public.review_credit_application(UUID, VARCHAR, NUMERIC, INT, TEXT, VARCHAR) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_credit_application(UUID, VARCHAR, NUMERIC, INT, TEXT, VARCHAR) TO service_role;
