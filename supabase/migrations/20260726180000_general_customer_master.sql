-- Migration: 20260726180000_general_customer_master.sql
-- Description: Paket B — General Retail Customer Master Schema & Orders FK Link (Fail-Fast Precondition Hardened)
-- Scope: Defines public.customers master table, security/RLS, triggers, and nullable orders.customer_id link.

BEGIN;

-- ============================================================================
-- 1. PRECONDITION CHECKS (Fail-Fast: Raise Exception if any target object exists)
-- ============================================================================
DO $$
BEGIN
  -- Precondition A: Ensure public.customers table does not already exist
  IF to_regclass('public.customers') IS NOT NULL THEN
    RAISE EXCEPTION 'public.customers table already exists; inspect schema before applying migration';
  END IF;

  -- Precondition B: Ensure public.orders exists
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'public.orders table does not exist; cannot add customer_id link';
  END IF;

  -- Precondition C: Ensure orders.customer_id column does not already exist
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'orders' AND c.relnamespace = 'public'::regnamespace AND a.attname = 'customer_id' AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'public.orders.customer_id already exists; inspect type/FK before migration';
  END IF;

  -- Precondition D: Ensure fk_orders_customer_id constraint does not already exist
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    WHERE c.relname = 'orders' AND con.contype = 'f' AND con.conname = 'fk_orders_customer_id'
  ) THEN
    RAISE EXCEPTION 'Constraint fk_orders_customer_id already exists on public.orders';
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE PUBLIC.CUSTOMERS MASTER TABLE (Strict DDL without IF NOT EXISTS)
-- ============================================================================
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_normalized TEXT NOT NULL CONSTRAINT uq_customers_phone_normalized UNIQUE CONSTRAINT chk_customers_phone_normalized CHECK (phone_normalized ~ '^905[0-9]{9}$'),
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT chk_customers_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED')),
    whatsapp_wa_id TEXT,
    registration_source TEXT NOT NULL CONSTRAINT chk_customers_registration_source CHECK (registration_source IN ('WEB', 'WHATSAPP', 'STORE', 'SERVICE', 'CARI', 'ADMIN', 'IMPORT')),
    phone_verified_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES (Strict without IF NOT EXISTS)
-- ============================================================================
CREATE UNIQUE INDEX idx_customers_whatsapp_wa_id ON public.customers(whatsapp_wa_id) WHERE whatsapp_wa_id IS NOT NULL;
CREATE INDEX idx_customers_created_at ON public.customers(created_at DESC);

-- ============================================================================
-- 4. UPDATED_AT TRIGGER FUNCTION (Strict without CREATE OR REPLACE)
-- ============================================================================
CREATE FUNCTION public.set_customers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customers_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_customers_updated_at();

-- ============================================================================
-- 5. RLS & STRICT SECURITY HARDENING (RPC / Server-Side ServiceRole Only)
-- ============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;

-- Grant SELECT, INSERT, UPDATE to service_role (DELETE intentionally withheld to enforce soft-delete / status BLOCKED)
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO service_role;

-- ============================================================================
-- 6. ADD CUSTOMER_ID LINK TO PUBLIC.ORDERS (Strict without ADD COLUMN IF NOT EXISTS)
-- ============================================================================
ALTER TABLE public.orders ADD COLUMN customer_id UUID NULL;

ALTER TABLE public.orders
ADD CONSTRAINT fk_orders_customer_id
FOREIGN KEY (customer_id)
REFERENCES public.customers(id)
ON DELETE RESTRICT;

CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);

COMMIT;
