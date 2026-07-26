-- Migration: 20260726190000_customers_service_role_acl_fix.sql
-- Description: Paket B Forward-Fix — Revoke DELETE privilege from service_role on public.customers
-- Scope: Explicitly revokes ALL privileges on public.customers from service_role before granting SELECT, INSERT, UPDATE.

BEGIN;

-- 1. Precondition Checks (Fail-Fast: Ensure table and role exist)
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'public.customers table does not exist; cannot apply ACL fix';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role role does not exist; cannot apply ACL fix';
  END IF;
END $$;

-- 2. Clear default table privileges (including default DELETE) on public.customers from service_role
REVOKE ALL ON TABLE public.customers FROM service_role;

-- 3. Grant exclusively SELECT, INSERT, UPDATE to service_role (DELETE remains strictly denied)
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO service_role;

COMMIT;
