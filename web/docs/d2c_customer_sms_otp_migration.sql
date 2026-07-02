-- D2C Customer and SMS OTP Tables Migration Draft
-- Note: This is a draft. Do not run on production directly without creating a proper Supabase migration file.

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,
    phone_normalized TEXT UNIQUE NOT NULL,
    phone_verified_at TIMESTAMPTZ,
    full_name TEXT,
    kvkk_consent_at TIMESTAMPTZ,
    marketing_consent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by normalized phone
CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON public.customers(phone_normalized);

-- 2. Customer Addresses Table
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    title TEXT,
    full_name TEXT,
    phone TEXT,
    city TEXT,
    district TEXT,
    address TEXT,
    postal_code TEXT,
    invoice_type TEXT,
    tax_office TEXT,
    tax_number TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for customer addresses lookup
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);

-- 3. SMS OTP Codes Table
CREATE TABLE IF NOT EXISTS public.sms_otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_normalized TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for checking active OTPs for a specific phone number
CREATE INDEX IF NOT EXISTS idx_sms_otp_codes_phone_normalized ON public.sms_otp_codes(phone_normalized);

-- ==============================================================================
-- NOTE ON ORDERS TABLE:
-- In the future, the following columns can be added to the `orders` table to link 
-- the order to the registered customer:
--
-- ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
-- ALTER TABLE public.orders ADD COLUMN customer_address_id UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL;
-- ==============================================================================
