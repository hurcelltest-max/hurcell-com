-- Migration: 20260708135124_credit_system_tables.sql
-- Description: Core tables for HurCELL Cari / Veresiye Sistemi Phase 1

-- 1. Credit Customers Table
CREATE TABLE IF NOT EXISTS public.credit_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID, -- Optional future link to online customer table; no FK because public.customers does not exist in production yet
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    phone_normalized TEXT UNIQUE NOT NULL,
    tc_identity_number TEXT,
    tax_office TEXT,
    tax_number TEXT,
    address TEXT,
    city TEXT,
    district TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blacklisted')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_customers_phone_normalized ON public.credit_customers(phone_normalized);

-- 2. Credit Accounts Table
CREATE TABLE IF NOT EXISTS public.credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_customer_id UUID NOT NULL REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
    credit_limit NUMERIC NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    current_balance NUMERIC NOT NULL DEFAULT 0, -- Positive means debt
    statement_day INT NOT NULL CHECK (statement_day IN (10, 15, 20, 25)),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_accounts_customer ON public.credit_accounts(credit_customer_id);

-- 3. Credit Agreement Acceptances Table (OTP Evidences)
CREATE TABLE IF NOT EXISTS public.credit_agreement_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_customer_id UUID REFERENCES public.credit_customers(id) ON DELETE SET NULL,
    credit_account_id UUID REFERENCES public.credit_accounts(id) ON DELETE SET NULL,
    agreement_version TEXT NOT NULL,
    agreement_title TEXT NOT NULL,
    agreement_body_hash TEXT NOT NULL,
    agreement_body_snapshot TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_phone TEXT NOT NULL,
    otp_verification_id UUID REFERENCES public.phone_verifications(id) ON DELETE SET NULL,
    otp_channel TEXT DEFAULT 'sms',
    ip_address TEXT,
    user_agent TEXT,
    accepted_by_admin_id UUID, -- If approved by an admin manually or wet signature
    acceptance_method TEXT DEFAULT 'sms_otp' CHECK (acceptance_method IN ('sms_otp', 'wet_signature', 'e_signature', 'manual')),
    checkbox_terms_accepted BOOLEAN NOT NULL DEFAULT false,
    checkbox_payment_terms_accepted BOOLEAN NOT NULL DEFAULT false,
    checkbox_kvkk_notice_read BOOLEAN NOT NULL DEFAULT false,
    marketing_sms_consent BOOLEAN,
    marketing_whatsapp_consent BOOLEAN,
    evidence_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_agreement_customer ON public.credit_agreement_acceptances(credit_customer_id);

-- 4. Credit Audit Logs Table
CREATE TABLE IF NOT EXISTS public.credit_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_account_id UUID REFERENCES public.credit_accounts(id) ON DELETE SET NULL,
    admin_id UUID, -- Who did it
    action_type TEXT NOT NULL, -- e.g., 'limit_change', 'statement_day_change', 'status_change'
    old_value JSONB,
    new_value JSONB,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Setup
ALTER TABLE public.credit_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_agreement_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_audit_logs ENABLE ROW LEVEL SECURITY;

-- By default, all operations are denied to public/anon/authenticated.
-- All operations will be strictly managed via server-side APIs using service_role.

-- 1. credit_customers
CREATE POLICY "ServiceRole full access to credit_customers" ON public.credit_customers FOR ALL TO service_role USING (true);

-- 2. credit_accounts
CREATE POLICY "ServiceRole full access to credit_accounts" ON public.credit_accounts FOR ALL TO service_role USING (true);

-- 3. credit_agreement_acceptances (Append-Only)
CREATE POLICY "ServiceRole insert to credit_agreement_acceptances" ON public.credit_agreement_acceptances FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "ServiceRole select to credit_agreement_acceptances" ON public.credit_agreement_acceptances FOR SELECT TO service_role USING (true);

-- Trigger to prevent update/delete on append-only tables
CREATE OR REPLACE FUNCTION public.prevent_credit_append_only_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Updates and Deletes are strictly forbidden on table: %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_credit_agreement_modifications ON public.credit_agreement_acceptances;
CREATE TRIGGER prevent_credit_agreement_modifications
BEFORE UPDATE OR DELETE ON public.credit_agreement_acceptances
FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_append_only_update_delete();

-- 4. credit_audit_logs (Append-Only)
CREATE POLICY "ServiceRole insert to credit_audit_logs" ON public.credit_audit_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "ServiceRole select to credit_audit_logs" ON public.credit_audit_logs FOR SELECT TO service_role USING (true);

DROP TRIGGER IF EXISTS prevent_credit_audit_logs_modifications ON public.credit_audit_logs;
CREATE TRIGGER prevent_credit_audit_logs_modifications
BEFORE UPDATE OR DELETE ON public.credit_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_append_only_update_delete();
