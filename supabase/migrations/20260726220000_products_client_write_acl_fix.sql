-- Migration: 20260726220000_products_client_write_acl_fix.sql
-- Description: Paket O3 — Hardening public.products ACL by revoking direct write/admin privileges from PUBLIC, anon, authenticated, service_role
-- Scope:
--   1. Fail-fast precondition checks (verifies table, roles, RLS enabled, public_products_read_only SELECT policy, no write policies)
--   2. Explicit REVOKE of INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public.products from PUBLIC, anon, authenticated, service_role
--   3. Explicit GRANT of SELECT to anon, authenticated (No GRANT to PUBLIC)
--   4. Explicit GRANT of SELECT, INSERT, UPDATE to service_role (DELETE/TRUNCATE remain revoked)

BEGIN;

-- ============================================================================
-- 1. FAIL-FAST PRECONDITION CHECKS
-- ============================================================================
DO $$
BEGIN
  -- Precondition A: Ensure public.products table exists
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'FAIL-FAST: public.products table does not exist';
  END IF;

  -- Precondition B: Ensure service_role, anon, authenticated roles exist
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'FAIL-FAST: service_role role does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'FAIL-FAST: anon role does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'FAIL-FAST: authenticated role does not exist';
  END IF;

  -- Precondition C: Ensure Row Level Security is enabled on public.products
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'FAIL-FAST: Row Level Security is NOT enabled on public.products';
  END IF;

  -- Precondition D: Ensure public_products_read_only policy exists with cmd = SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products'
      AND policyname = 'public_products_read_only' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL-FAST: Policy public_products_read_only (cmd = SELECT) does not exist on public.products';
  END IF;

  -- Precondition E: Ensure no unexpected client write policies exist on public.products
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'FAIL-FAST: Unexpected write policy found on public.products';
  END IF;
END $$;

-- ============================================================================
-- 2. REVOKE DIRECT WRITE & ADMIN PRIVILEGES FROM ALL ROLES
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.products
FROM PUBLIC, anon, authenticated, service_role;

-- REVOKE SELECT from PUBLIC to keep PUBLIC ACL clean (grantee=0 has no privileges)
REVOKE SELECT ON TABLE public.products FROM PUBLIC;

-- ============================================================================
-- 3. GRANT EXACT MINIMUM REQUIRED PRIVILEGES TO CLIENT AND SERVICE ROLES
-- ============================================================================
-- Client Roles: SELECT only (Read-only catalog access controlled by RLS)
GRANT SELECT ON TABLE public.products TO anon, authenticated;

-- Service Role: SELECT, INSERT, UPDATE only (For checkout stock management & admin operations; DELETE/TRUNCATE remain revoked)
GRANT SELECT, INSERT, UPDATE ON TABLE public.products TO service_role;

COMMIT;
