-- Migration: 20260726200000_upsert_customer_identity_rpc.sql
-- Description: Paket C1 — Atomic Customer Identity Upsert RPC (Fail-Fast Precondition Hardened & Concurrency-Safe)
-- Scope: Defines SECURITY DEFINER RPC public.upsert_customer_identity for atomic, concurrency-safe retail customer master creation & update.

BEGIN;

-- ============================================================================
-- 1. STRUCTURAL PRECONDITION CHECKS (Fail-Fast: Ensure schema, columns & indexes match)
-- ============================================================================
DO $$
DECLARE
    v_has_unique_phone BOOLEAN;
BEGIN
  -- Precondition A: Ensure public.customers table exists
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'public.customers table does not exist; cannot create upsert_customer_identity RPC';
  END IF;

  -- Precondition B: Ensure required columns exist on public.customers
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'customers'
      AND c.relnamespace = 'public'::regnamespace
      AND a.attname IN ('phone_normalized', 'registration_source', 'status', 'last_seen_at', 'phone_verified_at', 'whatsapp_wa_id')
      AND NOT a.attisdropped
    HAVING count(a.attname) >= 6
  ) THEN
    RAISE EXCEPTION 'Required columns missing on public.customers for upsert_customer_identity RPC';
  END IF;

  -- Precondition C: Verify actual UNIQUE constraint or unique index on phone_normalized via pg_index
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE c.relname = 'customers'
      AND c.relnamespace = 'public'::regnamespace
      AND a.attname = 'phone_normalized'
      AND i.indisunique = true
  ) INTO v_has_unique_phone;

  IF NOT v_has_unique_phone THEN
    RAISE EXCEPTION 'Unique constraint or unique index missing on public.customers(phone_normalized)';
  END IF;

  -- Precondition D: Ensure service_role role exists
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role role does not exist';
  END IF;

  -- Precondition E: Ensure RPC signature does not already exist (Fail-Fast against silent replacement)
  IF to_regprocedure('public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Function public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text) already exists; inspect function before applying migration';
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE UPSERT_CUSTOMER_IDENTITY RPC FUNCTION (Strict without CREATE OR REPLACE)
-- ============================================================================
-- Signature Note: p_registration_source is required (no default) and placed before optional parameters
-- to comply with PostgreSQL parameter default ordering rules and Paket B registration_source policy.
CREATE FUNCTION public.upsert_customer_identity(
    p_phone_normalized TEXT,
    p_registration_source TEXT,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone_verified_at TIMESTAMPTZ DEFAULT NULL,
    p_whatsapp_wa_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    customer_id UUID,
    created BOOLEAN,
    status TEXT,
    phone_normalized TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id UUID;
    v_created BOOLEAN := FALSE;
    v_status TEXT;
    v_existing_wa_id TEXT;
BEGIN
    -- 1. Input Validation: Canonical 12-digit TR format ^905[0-9]{9}$ (No PII logged)
    IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^905[0-9]{9}$' THEN
        RAISE EXCEPTION 'Invalid phone_normalized format. Must be canonical 12-digit 905XXXXXXXXX format.';
    END IF;

    -- 2. Input Validation: Valid registration_source value (No NULL, exact allowed values)
    IF p_registration_source IS NULL OR trim(p_registration_source) NOT IN ('WEB', 'WHATSAPP', 'STORE', 'SERVICE', 'CARI', 'ADMIN', 'IMPORT') THEN
        RAISE EXCEPTION 'Invalid registration_source. Must be one of: WEB, WHATSAPP, STORE, SERVICE, CARI, ADMIN, IMPORT.';
    END IF;

    -- 3. Concurrency-Safe Deterministic Upsert Pattern
    -- Step A: Attempt INSERT ... ON CONFLICT DO NOTHING
    INSERT INTO public.customers (
        phone_normalized,
        registration_source,
        first_name,
        last_name,
        full_name,
        email,
        status,
        whatsapp_wa_id,
        phone_verified_at,
        last_seen_at,
        created_at,
        updated_at
    ) VALUES (
        p_phone_normalized,
        trim(p_registration_source),
        NULLIF(trim(p_first_name), ''),
        NULLIF(trim(p_last_name), ''),
        NULLIF(trim(p_full_name), ''),
        NULLIF(trim(p_email), ''),
        'ACTIVE',
        NULLIF(trim(p_whatsapp_wa_id), ''),
        p_phone_verified_at,
        now(),
        now(),
        now()
    )
    ON CONFLICT (phone_normalized) DO NOTHING
    RETURNING public.customers.id, public.customers.status INTO v_customer_id, v_status;

    -- Step B: Evaluate created flag and perform UPDATE if record already existed
    IF v_customer_id IS NOT NULL THEN
        v_created := TRUE;
    ELSE
        v_created := FALSE;

        -- Check existing customer whatsapp_wa_id to enforce overwrite conflict rules before UPDATE
        SELECT c.whatsapp_wa_id INTO v_existing_wa_id
        FROM public.customers c
        WHERE c.phone_normalized = p_phone_normalized;

        IF v_existing_wa_id IS NOT NULL AND p_whatsapp_wa_id IS NOT NULL AND trim(p_whatsapp_wa_id) <> '' AND v_existing_wa_id <> trim(p_whatsapp_wa_id) THEN
            RAISE EXCEPTION 'Customer whatsapp_wa_id conflict. Cannot overwrite existing bound WhatsApp ID.';
        END IF;

        UPDATE public.customers AS c SET
            last_seen_at = now(),
            updated_at = now(),
            -- Fill missing name/email fields without overwriting existing non-empty values
            first_name = CASE
                WHEN c.first_name IS NULL OR trim(c.first_name) = '' THEN NULLIF(trim(p_first_name), '')
                ELSE c.first_name
            END,
            last_name = CASE
                WHEN c.last_name IS NULL OR trim(c.last_name) = '' THEN NULLIF(trim(p_last_name), '')
                ELSE c.last_name
            END,
            full_name = CASE
                WHEN c.full_name IS NULL OR trim(c.full_name) = '' THEN NULLIF(trim(p_full_name), '')
                ELSE c.full_name
            END,
            email = CASE
                WHEN c.email IS NULL OR trim(c.email) = '' THEN NULLIF(trim(p_email), '')
                ELSE c.email
            END,
            -- Preserve existing phone_verified_at if already verified
            phone_verified_at = COALESCE(c.phone_verified_at, p_phone_verified_at),
            -- Fill whatsapp_wa_id if previously null
            whatsapp_wa_id = CASE
                WHEN c.whatsapp_wa_id IS NULL OR trim(c.whatsapp_wa_id) = '' THEN NULLIF(trim(p_whatsapp_wa_id), '')
                ELSE c.whatsapp_wa_id
            END
            -- NOTE: registration_source and status are intentionally NOT updated to preserve initial channel and BLOCKED/SUSPENDED status!
        WHERE c.phone_normalized = p_phone_normalized
        RETURNING c.id, c.status INTO v_customer_id, v_status;

        -- Zero-Row Guard: Ensure UPDATE succeeded
        IF v_customer_id IS NULL THEN
            RAISE EXCEPTION 'Customer identity update failed. Zero rows updated.';
        END IF;
    END IF;

    -- 4. Return typed result row with alias guards against PL/pgSQL variable collisions
    RETURN QUERY SELECT
        TRUE AS success,
        v_customer_id AS customer_id,
        v_created AS created,
        v_status AS status,
        p_phone_normalized AS phone_normalized;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Customer identity operation failed due to unique constraint conflict.';
END;
$$;

-- ============================================================================
-- 3. STRICT ACL SECURITY HARDENING (RPC Server-Side ServiceRole Only)
-- ============================================================================
REVOKE ALL ON FUNCTION public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_customer_identity(text,text,text,text,text,text,timestamptz,text) TO service_role;

COMMIT;
