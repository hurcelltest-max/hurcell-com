-- Migration: 20260708143000_credit_customer_cards.sql
-- Description: Phase 1.5 - Cari Müşteri Kartı ve Notlar Tablosu

-- 1. Create Sequence for Customer Card Code
CREATE SEQUENCE IF NOT EXISTS public.credit_customer_card_code_seq START 1;

-- 2. Add columns to credit_customers
ALTER TABLE public.credit_customers
ADD COLUMN IF NOT EXISTS customer_card_code TEXT UNIQUE NOT NULL DEFAULT 'HRC-CARI-' || LPAD(nextval('public.credit_customer_card_code_seq')::text, 6, '0'),
ADD COLUMN IF NOT EXISTS card_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS card_issued_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_credit_customers_card_code ON public.credit_customers(customer_card_code);
CREATE INDEX IF NOT EXISTS idx_credit_customers_card_token ON public.credit_customers(card_token);

-- 3. Create credit_customer_notes table
CREATE TABLE IF NOT EXISTS public.credit_customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_customer_id UUID NOT NULL REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
    note TEXT NOT NULL,
    note_type TEXT DEFAULT 'general',
    visibility TEXT DEFAULT 'admin_only' CHECK (visibility = 'admin_only'),
    created_by_admin_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_pinned BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_credit_customer_notes_customer ON public.credit_customer_notes(credit_customer_id);

-- RLS for credit_customer_notes
ALTER TABLE public.credit_customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ServiceRole insert to credit_customer_notes" ON public.credit_customer_notes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "ServiceRole select to credit_customer_notes" ON public.credit_customer_notes FOR SELECT TO service_role USING (true);

-- Trigger to prevent update/delete on credit_customer_notes
DROP TRIGGER IF EXISTS prevent_credit_customer_notes_modifications ON public.credit_customer_notes;
CREATE TRIGGER prevent_credit_customer_notes_modifications
BEFORE UPDATE OR DELETE ON public.credit_customer_notes
FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_append_only_update_delete();
