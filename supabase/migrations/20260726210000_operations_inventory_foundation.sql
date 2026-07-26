-- Migration: 20260726210000_operations_inventory_foundation.sql
-- Description: Paket O3 — HurCELL Operasyon Merkezi Stok & İş Akışı Temel Şeması (Production Security Hardened)
-- Scope:
--   1. Products fail-fast preconditions & safe column extensions (all defaults safe/false/null; zero existing product status mutation)
--   2. stock_movements ledger tablosu, TRUNCATE/UPDATE/DELETE engelleme trigger'ı ve ACL
--   3. operation_approvals onay tablosu & terminal-state immutability trigger'ı
--   4. apply_stock_movement SECURITY DEFINER RPC (Row-Lock FOR UPDATE, exact delta sign rules, idempotency payload fingerprinting, approval-required movement blocking for O4)

BEGIN;

-- ============================================================================
-- 1. STRUCTURAL PRECONDITION CHECKS (Fail-Fast Strict Validation)
-- ============================================================================
DO $$
DECLARE
  v_id_type TEXT;
  v_stock_type TEXT;
  v_price_type TEXT;
BEGIN
  -- Precondition A: Ensure public.products table exists
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'FAIL-FAST: public.products table does not exist';
  END IF;

  -- Precondition B: Verify strict column data types on public.products
  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id';

  IF v_id_type IS NULL OR v_id_type <> 'uuid' THEN
    RAISE EXCEPTION 'FAIL-FAST: public.products.id column must be UUID, found %', v_id_type;
  END IF;

  SELECT data_type INTO v_stock_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock';

  IF v_stock_type IS NULL OR v_stock_type <> 'integer' THEN
    RAISE EXCEPTION 'FAIL-FAST: public.products.stock column must be strictly integer, found %', v_stock_type;
  END IF;

  SELECT data_type INTO v_price_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price';

  IF v_price_type IS NULL OR v_price_type NOT IN ('numeric', 'double precision') THEN
    RAISE EXCEPTION 'FAIL-FAST: public.products.price column type incompatible: %', v_price_type;
  END IF;

  -- Precondition C: Ensure service_role role exists
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'FAIL-FAST: service_role role does not exist';
  END IF;

  -- Precondition D: Ensure RPC signature does not already exist
  IF to_regprocedure('public.apply_stock_movement(uuid,text,integer,text,text,text,uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL-FAST: Function public.apply_stock_movement already exists';
  END IF;
END $$;

-- ============================================================================
-- 2. PRODUCTS TABLE COLUMN EXTENSIONS (Safe Non-Mutating Defaults)
-- ============================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS min_stock_level INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_web_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_display_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_description TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_sort_order INT DEFAULT 0;

-- Add CHECK constraints if not existing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_cost_price_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_cost_price_non_negative CHECK (cost_price IS NULL OR cost_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_min_stock_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_min_stock_non_negative CHECK (min_stock_level IS NULL OR min_stock_level >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_whatsapp_price_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_whatsapp_price_non_negative CHECK (whatsapp_price IS NULL OR whatsapp_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_whatsapp_sort_order_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_whatsapp_sort_order_non_negative CHECK (whatsapp_sort_order >= 0);
  END IF;
END $$;

-- ============================================================================
-- 3. CREATE PUBLIC.STOCK_MOVEMENTS TABLE & IMMUTABLE TRIGGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
      'STOCK_IN',
      'SALE',
      'RETURN',
      'COUNT_INCREASE',
      'COUNT_DECREASE',
      'DAMAGE',
      'INTERNAL_USE',
      'PRINT_MATERIAL_USE',
      'MANUAL_ADJUSTMENT'
    )),
    quantity INT NOT NULL CHECK (quantity > 0),
    quantity_delta INT NOT NULL CHECK (quantity_delta <> 0),
    stock_before INT NOT NULL CHECK (stock_before >= 0),
    stock_after INT NOT NULL CHECK (stock_after >= 0),
    reference_type VARCHAR(50) DEFAULT NULL,
    reference_id UUID DEFAULT NULL,
    note VARCHAR(500) DEFAULT NULL,
    performed_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    approval_id UUID DEFAULT NULL,
    idempotency_key VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_stock_movements_delta_math CHECK (stock_after = stock_before + quantity_delta)
);

-- Global unique index for idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_idempotency_key
ON public.stock_movements(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

-- IMMUTABLE TRIGGER ON public.stock_movements (Prevent UPDATE / DELETE / TRUNCATE)
CREATE OR REPLACE FUNCTION public.prevent_stock_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements records are immutable and cannot be updated, deleted, or truncated.';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_stock_movement_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_stock_movement_mutation() TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_stock_movement_row_mutation ON public.stock_movements;
CREATE TRIGGER trg_prevent_stock_movement_row_mutation
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.prevent_stock_movement_mutation();

DROP TRIGGER IF EXISTS trg_prevent_stock_movement_truncate_mutation ON public.stock_movements;
CREATE TRIGGER trg_prevent_stock_movement_truncate_mutation
BEFORE TRUNCATE ON public.stock_movements
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_stock_movement_mutation();

-- RLS ON stock_movements (Strict ACL)
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stock_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.stock_movements FROM service_role;
GRANT SELECT, INSERT ON TABLE public.stock_movements TO service_role;

-- ============================================================================
-- 4. CREATE PUBLIC.OPERATION_APPROVALS TABLE & TERMINAL STATE TRIGGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.operation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN (
      'MANUAL_ADJUSTMENT',
      'COUNT_INCREASE',
      'COUNT_DECREASE',
      'PRICE_CHANGE',
      'WEB_PUBLISH_CHANGE',
      'WHATSAPP_PUBLISH_CHANGE',
      'BULK_SMS',
      'RETURN_APPROVAL',
      'PRINT_JOB',
      'CUSTOMER_STATUS_CHANGE',
      'LOYALTY_ADJUSTMENT'
    )),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    requested_payload JSONB NOT NULL,
    previous_snapshot JSONB DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_by VARCHAR(100) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by VARCHAR(100) DEFAULT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    review_note TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_approvals_reviewed_consistency CHECK (
      (status IN ('APPROVED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR
      (status IN ('PENDING', 'CANCELLED'))
    )
);

CREATE INDEX IF NOT EXISTS idx_operation_approvals_pending ON public.operation_approvals(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_operation_approvals_entity ON public.operation_approvals(entity_type, entity_id);

-- Terminal State Mutation Protection Trigger for operation_approvals
CREATE OR REPLACE FUNCTION public.enforce_operation_approvals_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Prevent mutation if OLD record is already in a terminal state
    IF OLD.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Terminal approval records (status %) cannot be modified.', OLD.status;
    END IF;

    -- Prevent mutation of core request payload fields once created
    IF NEW.approval_type <> OLD.approval_type OR
       NEW.entity_type <> OLD.entity_type OR
       NEW.entity_id <> OLD.entity_id OR
       NEW.requested_payload <> OLD.requested_payload OR
       NEW.requested_by <> OLD.requested_by THEN
        RAISE EXCEPTION 'Approval core payload fields are immutable once submitted.';
    END IF;

    -- Enforce reviewed_by / reviewed_at on terminal review transition
    IF NEW.status IN ('APPROVED', 'REJECTED') THEN
        IF NULLIF(trim(NEW.reviewed_by), '') IS NULL OR NEW.reviewed_at IS NULL THEN
            RAISE EXCEPTION 'reviewed_by and reviewed_at must be provided when approving or rejecting.';
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_operation_approvals_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_operation_approvals_integrity() TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_operation_approvals_integrity ON public.operation_approvals;
CREATE TRIGGER trg_enforce_operation_approvals_integrity
BEFORE UPDATE ON public.operation_approvals
FOR EACH ROW EXECUTE FUNCTION public.enforce_operation_approvals_integrity();

ALTER TABLE public.operation_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operation_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operation_approvals FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.operation_approvals TO service_role;

-- ============================================================================
-- 5. CREATE APPLY_STOCK_MOVEMENT RPC FUNCTION
-- ============================================================================
CREATE FUNCTION public.apply_stock_movement(
    p_product_id UUID,
    p_movement_type TEXT,
    p_quantity_delta INT,
    p_performed_by TEXT,
    p_note TEXT DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_approval_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    movement_id UUID,
    product_id UUID,
    stock_before INT,
    stock_after INT,
    movement_type TEXT,
    idempotent_replay BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_type TEXT;
    v_clean_actor TEXT;
    v_clean_idempotency TEXT;
    v_clean_ref_type TEXT;
    v_current_stock INT;
    v_new_stock INT;
    v_abs_qty INT;
    v_movement_id UUID;
    v_existing_rec RECORD;
BEGIN
    -- 1. Input Validation: Product ID & Actor
    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'Invalid p_product_id: cannot be NULL';
    END IF;

    v_clean_actor := NULLIF(trim(p_performed_by), '');
    IF v_clean_actor IS NULL THEN
        RAISE EXCEPTION 'Invalid p_performed_by: must be non-empty actor identifier';
    END IF;

    IF length(v_clean_actor) > 100 THEN
        v_clean_actor := substring(v_clean_actor FROM 1 FOR 100);
    END IF;

    -- 2. Input Validation: Delta
    IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
        RAISE EXCEPTION 'Invalid p_quantity_delta: must be non-zero integer';
    END IF;

    -- 3. Input Validation: Movement Type & Delta Direction
    v_clean_type := trim(p_movement_type);
    IF v_clean_type IS NULL OR v_clean_type NOT IN (
      'STOCK_IN', 'SALE', 'RETURN', 'COUNT_INCREASE', 'COUNT_DECREASE',
      'DAMAGE', 'INTERNAL_USE', 'PRINT_MATERIAL_USE', 'MANUAL_ADJUSTMENT'
    ) THEN
        RAISE EXCEPTION 'Invalid p_movement_type %', p_movement_type;
    END IF;

    -- Block approval-required movements in Paket O3 (Enforced for O4 package)
    IF v_clean_type IN ('COUNT_INCREASE', 'COUNT_DECREASE', 'MANUAL_ADJUSTMENT') THEN
        RAISE EXCEPTION 'Movement type % requires approval workflow which is enabled in O4 package.', v_clean_type;
    END IF;

    IF v_clean_type IN ('STOCK_IN', 'RETURN') AND p_quantity_delta < 0 THEN
        RAISE EXCEPTION 'Movement type % requires positive quantity_delta', v_clean_type;
    END IF;

    IF v_clean_type IN ('SALE', 'DAMAGE', 'INTERNAL_USE', 'PRINT_MATERIAL_USE') AND p_quantity_delta > 0 THEN
        RAISE EXCEPTION 'Movement type % requires negative quantity_delta', v_clean_type;
    END IF;

    v_clean_ref_type := NULLIF(trim(p_reference_type), '');
    v_clean_idempotency := NULLIF(trim(p_idempotency_key), '');

    -- 4. Idempotency Check & Payload Fingerprint Validation (Pre-Lock)
    IF v_clean_idempotency IS NOT NULL THEN
        SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity_delta, sm.reference_type, sm.reference_id, sm.stock_before, sm.stock_after
        INTO v_existing_rec
        FROM public.stock_movements sm
        WHERE sm.idempotency_key = v_clean_idempotency;

        IF v_existing_rec.id IS NOT NULL THEN
            -- Validate request payload fingerprint against existing idempotency record
            IF v_existing_rec.product_id <> p_product_id OR
               v_existing_rec.movement_type <> v_clean_type OR
               v_existing_rec.quantity_delta <> p_quantity_delta OR
               COALESCE(v_existing_rec.reference_type, '') <> COALESCE(v_clean_ref_type, '') OR
               COALESCE(v_existing_rec.reference_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(p_reference_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
                RAISE EXCEPTION 'Idempotency key payload conflict.';
            END IF;

            RETURN QUERY SELECT
                TRUE AS success,
                v_existing_rec.id AS movement_id,
                p_product_id AS product_id,
                v_existing_rec.stock_before AS stock_before,
                v_existing_rec.stock_after AS stock_after,
                v_clean_type AS movement_type,
                TRUE AS idempotent_replay;
            RETURN;
        END IF;
    END IF;

    -- 5. Row Lock on public.products FOR UPDATE
    SELECT p.stock INTO v_current_stock
    FROM public.products p
    WHERE p.id = p_product_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Product % not found', p_product_id;
    END IF;

    -- 6. Idempotency Check (Post-Lock Double Check)
    IF v_clean_idempotency IS NOT NULL THEN
        SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity_delta, sm.reference_type, sm.reference_id, sm.stock_before, sm.stock_after
        INTO v_existing_rec
        FROM public.stock_movements sm
        WHERE sm.idempotency_key = v_clean_idempotency;

        IF v_existing_rec.id IS NOT NULL THEN
            IF v_existing_rec.product_id <> p_product_id OR
               v_existing_rec.movement_type <> v_clean_type OR
               v_existing_rec.quantity_delta <> p_quantity_delta THEN
                RAISE EXCEPTION 'Idempotency key payload conflict.';
            END IF;

            RETURN QUERY SELECT
                TRUE AS success,
                v_existing_rec.id AS movement_id,
                p_product_id AS product_id,
                v_existing_rec.stock_before AS stock_before,
                v_existing_rec.stock_after AS stock_after,
                v_clean_type AS movement_type,
                TRUE AS idempotent_replay;
            RETURN;
        END IF;
    END IF;

    v_new_stock := v_current_stock + p_quantity_delta;

    -- 7. Negative Stock Guard
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Negative stock prohibited. Current: %, Delta: %, Projected: %', v_current_stock, p_quantity_delta, v_new_stock;
    END IF;

    v_abs_qty := abs(p_quantity_delta);

    -- 8. Update public.products stock
    UPDATE public.products AS pr SET
        stock = v_new_stock,
        updated_at = now()
    WHERE pr.id = p_product_id;

    -- 9. Insert stock_movements ledger entry
    INSERT INTO public.stock_movements (
        product_id,
        movement_type,
        quantity,
        quantity_delta,
        stock_before,
        stock_after,
        reference_type,
        reference_id,
        note,
        performed_by,
        approval_id,
        idempotency_key,
        created_at
    ) VALUES (
        p_product_id,
        v_clean_type,
        v_abs_qty,
        p_quantity_delta,
        v_current_stock,
        v_new_stock,
        v_clean_ref_type,
        p_reference_id,
        NULLIF(trim(p_note), ''),
        v_clean_actor,
        p_approval_id,
        v_clean_idempotency,
        now()
    )
    RETURNING id INTO v_movement_id;

    -- 10. Return typed result
    RETURN QUERY SELECT
        TRUE AS success,
        v_movement_id AS movement_id,
        p_product_id AS product_id,
        v_current_stock AS stock_before,
        v_new_stock AS stock_after,
        v_clean_type AS movement_type,
        FALSE AS idempotent_replay;

EXCEPTION
    WHEN unique_violation THEN
        IF v_clean_idempotency IS NOT NULL THEN
            SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity_delta, sm.stock_before, sm.stock_after
            INTO v_existing_rec
            FROM public.stock_movements sm
            WHERE sm.idempotency_key = v_clean_idempotency;

            IF v_existing_rec.id IS NOT NULL THEN
                RETURN QUERY SELECT
                    TRUE AS success,
                    v_existing_rec.id AS movement_id,
                    p_product_id AS product_id,
                    v_existing_rec.stock_before AS stock_before,
                    v_existing_rec.stock_after AS stock_after,
                    v_clean_type AS movement_type,
                    TRUE AS idempotent_replay;
                RETURN;
            END IF;
        END IF;
        RAISE EXCEPTION 'Stock movement failed due to unique constraint';
END;
$$;

-- Strict ACL Hardening
REVOKE ALL ON FUNCTION public.apply_stock_movement(UUID, TEXT, INT, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(UUID, TEXT, INT, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;

COMMIT;
