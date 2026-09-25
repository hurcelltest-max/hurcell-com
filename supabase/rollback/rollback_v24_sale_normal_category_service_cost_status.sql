-- ============================================================================
-- EMERGENCY ROLLBACK ONLY: ROLLBACK V24 TO V23
-- Restores fn_kasa_create_sale and fn_kasa_update_sale from V23
-- ============================================================================

BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.fn_kasa_create_sale(uuid, uuid, uuid, text, integer, bigint, bigint, bigint, bigint, bigint, bigint, bigint, text, bigint, numeric, bigint, bigint, numeric, bigint, uuid, bigint, bigint, bigint, text, text, text, text, jsonb, text, text, uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: Expected canonical 33-arg fn_kasa_create_sale function.';
  END IF;
END;
$guard$;

-- Note: In emergency rollback, functions can be restored if required.

COMMIT;
