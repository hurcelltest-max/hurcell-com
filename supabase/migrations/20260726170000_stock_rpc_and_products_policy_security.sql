-- ============================================================================
-- Migration: 20260726170000_stock_rpc_and_products_policy_security.sql
-- Description: Paket A — Production Security Hardening Migration
-- Targets:
--   1. Harden decrement_product_stock_safe RPC (search_path & execute privileges)
--   2. Replace unsafe products "Public Access" FOR ALL policy with FOR SELECT policy
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. HARDEN DECREMENT_PRODUCT_STOCK_SAFE RPC
-- ============================================================================
-- Ensure fixed search_path = public, pg_temp to eliminate search_path hijacking
ALTER FUNCTION public.decrement_product_stock_safe(uuid, integer)
  SET search_path = public, pg_temp;

-- Revoke execute privileges from unauthenticated / client roles
REVOKE ALL ON FUNCTION public.decrement_product_stock_safe(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_product_stock_safe(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.decrement_product_stock_safe(uuid, integer) FROM authenticated;

-- Grant execute privilege exclusively to service_role for server-side API execution
GRANT EXECUTE ON FUNCTION public.decrement_product_stock_safe(uuid, integer) TO service_role;

-- ============================================================================
-- 2. HARDEN PRODUCTS TABLE RLS POLICIES
-- ============================================================================
-- Remove unsafe production FOR ALL policy and historical repo policy variants
DROP POLICY IF EXISTS "Public Access" ON public.products;
DROP POLICY IF EXISTS "Public can view web visible products" ON public.products;
DROP POLICY IF EXISTS public_web_visible_products_policy ON public.products;
DROP POLICY IF EXISTS public_products_read_only ON public.products;

-- Create minimum secure read-only policy for public catalog browsing
-- Note: Channel-specific visibility filtering (whatsapp_visible) will be integrated in Paket C
CREATE POLICY public_products_read_only
ON public.products
FOR SELECT
TO public
USING (true);

COMMIT;

-- ============================================================================
-- CONTROLLED ROLLBACK PLAN DOCUMENTATION (DO NOT EXECUTE IN PRODUCTION)
-- ============================================================================
-- WARNING: NEVER ROLLBACK TO FOR ALL POLICY OR PUBLIC RPC EXECUTE IN PRODUCTION.
--
-- IF EMERGENCIES REQUIRE REVERTS TO RPC ACCESS OR POLICY BEHAVIOR:
-- 1. To temporarily allow authenticated users to execute stock decrement (if client RPC is needed):
--    GRANT EXECUTE ON FUNCTION public.decrement_product_stock_safe(uuid, integer) TO authenticated;
-- 2. To revert products policy to simple SELECT:
--    DROP POLICY IF EXISTS public_products_read_only ON public.products;
--    CREATE POLICY public_products_read_only ON public.products FOR SELECT TO public USING (true);
-- NEVER RE-ENABLE "Public Access" FOR ALL POLICY ON PUBLIC.PRODUCTS.
-- ============================================================================
