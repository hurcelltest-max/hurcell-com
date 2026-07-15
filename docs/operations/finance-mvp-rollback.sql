-- docs/operations/finance-mvp-rollback.sql
-- Guarded rollback script for HurCELL Finance MVP.
-- Target: Only drops tables/functions/sequences introduced in 20260715090000_finance_installments_mvp.sql
-- Safety: Aborts if any non-test finance data (source_reference not starting with 'TEST-') exists.

DO $$
DECLARE
  v_non_test_count INT := 0;
BEGIN
  -- Safety Check: Abort if non-test data exists in public.finance_plans
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'finance_plans'
  ) THEN
    SELECT COUNT(*) INTO v_non_test_count
    FROM public.finance_plans
    WHERE source_reference NOT LIKE 'TEST-%';
    
    IF v_non_test_count > 0 THEN
      RAISE EXCEPTION 'Rollback aborted: Non-test finance data detected in public.finance_plans (% records). Only test plans (source_reference LIKE ''TEST-%'') are allowed to be removed by this script.', v_non_test_count;
    END IF;
  END IF;
END $$;

-- 1. Drop Triggers
DROP TRIGGER IF EXISTS prevent_collections_modifications ON public.finance_collections;
DROP TRIGGER IF EXISTS prevent_audit_logs_modifications ON public.finance_audit_logs;

-- 2. Drop Functions
DROP FUNCTION IF EXISTS public.create_finance_plan(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, SMALLINT, SMALLINT, DATE, TEXT);
DROP FUNCTION IF EXISTS public.record_finance_collection(TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cancel_finance_plan(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.prevent_finance_append_only_update_delete();

-- 3. Drop Child Tables
DROP TABLE IF EXISTS public.finance_audit_logs;
DROP TABLE IF EXISTS public.finance_collections;
DROP TABLE IF EXISTS public.finance_installments;

-- 4. Drop Parent Table
DROP TABLE IF EXISTS public.finance_plans;

-- 5. Drop Sequences
DROP SEQUENCE IF EXISTS public.finance_receipt_seq;
