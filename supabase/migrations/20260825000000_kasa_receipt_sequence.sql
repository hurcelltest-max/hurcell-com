-- Migration: 20260825000000_kasa_receipt_sequence.sql
-- Description: Create public.kasa_receipt_seq if not exists, safely set starting value based on FS-YYYYMMDD-XXXXX pattern without modifying existing sequence counter.

BEGIN;

-- 1. Create receipt sequence if it does not exist
CREATE SEQUENCE IF NOT EXISTS public.kasa_receipt_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 2. Safely initialize sequence starting value ONLY IF sequence was newly created (pg_sequences.last_value IS NULL)
DO $$
DECLARE
    v_max_id BIGINT := 0;
    v_curr_val BIGINT := 0;
BEGIN
    SELECT last_value INTO v_curr_val FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq';

    -- Only setval if sequence is brand new / uninitialized
    IF v_curr_val IS NULL THEN
        IF to_regclass('public.kasa_sales') IS NOT NULL THEN
            SELECT COALESCE(MAX(
                CASE 
                    WHEN receipt_no ~ '^FS-[0-9]{8}-([0-9]+)$' THEN CAST(SUBSTRING(receipt_no FROM '^FS-[0-9]{8}-([0-9]+)$') AS BIGINT)
                    ELSE 0
                END
            ), 0) INTO v_max_id FROM public.kasa_sales;
        END IF;

        IF v_max_id > 0 THEN
            PERFORM setval('public.kasa_receipt_seq', v_max_id, true);
        END IF;
    END IF;
END $$;

-- 3. Lock sequence access from public, anon, authenticated roles
REVOKE ALL ON SEQUENCE public.kasa_receipt_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kasa_receipt_seq TO service_role;

COMMIT;
