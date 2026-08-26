-- Migration: Add 'no_cost' status & enforce trigger-level Teknik Servis cost validations
-- Target File: supabase/migrations/20260826150000_kasa_service_no_cost_status.sql

BEGIN;

-- 1. Table-Level Check Constraint Update (Safe for Non-Technical Sales)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'kasa_sales'
          AND con.conname = 'chk_kasa_sales_service_cost_payment_status'
    ) THEN
        ALTER TABLE public.kasa_sales DROP CONSTRAINT chk_kasa_sales_service_cost_payment_status;
    END IF;

    ALTER TABLE public.kasa_sales ADD CONSTRAINT chk_kasa_sales_service_cost_payment_status 
        CHECK (
            service_cost_payment_status IN (
                'paid_from_cash',
                'previously_paid_or_stock',
                'unpaid',
                'no_cost',
                'legacy_unspecified'
            )
            AND (
                service_cost_payment_status <> 'no_cost'
                OR COALESCE(service_cost_kurus, 0) = 0
            )
        );
END $$;

-- 2. Trigger Function for Service Cost Validation & Normalization
CREATE OR REPLACE FUNCTION public.fn_kasa_validate_service_cost_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_category_name TEXT;
BEGIN
    -- Kategori Adını Bul
    SELECT name INTO v_category_name 
    FROM public.kasa_categories 
    WHERE id = NEW.category_id;

    IF v_category_name IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Satış kategorisi bulunamadı.';
    END IF;

    -- Kategori Teknik Servis İse
    IF v_category_name = 'Teknik Servis' THEN
        NEW.service_cost_payment_status := COALESCE(NULLIF(TRIM(NEW.service_cost_payment_status), ''), '');

        IF NEW.service_cost_payment_status = '' THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET_DURUMU: Yeni Teknik Servis satışında maliyet ödeme durumu seçilmelidir.';
        ELSIF NEW.service_cost_payment_status = 'legacy_unspecified' THEN
            -- Yeni eklemede legacy_unspecified reddedilir. Güncellemede eski kaydın legacy kalmasına izin verilir.
            IF TG_OP = 'INSERT' THEN
                RAISE EXCEPTION 'GEÇERSİZ_MALİYET_DURUMU: Yeni Teknik Servis satışında legacy_unspecified kullanılamaz.';
            END IF;
        ELSIF NEW.service_cost_payment_status = 'no_cost' THEN
            IF COALESCE(NEW.service_cost_kurus, 0) > 0 THEN
                RAISE EXCEPTION 'GEÇERSİZ_MALİYET_DURUMU: Maliyet yok (no_cost) seçilen işlemde maliyet tutarı 0 TL olmalıdır.';
            END IF;
            NEW.service_cost_kurus := 0;
        ELSIF NEW.service_cost_payment_status IN ('paid_from_cash', 'previously_paid_or_stock', 'unpaid') THEN
            IF COALESCE(NEW.service_cost_kurus, 0) <= 0 THEN
                RAISE EXCEPTION 'GEÇERSİZ_MALİYET_DURUMU: Seçilen maliyet durumu için pozitif Teknik Servis maliyeti girilmelidir.';
            END IF;
        ELSE
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET_DURUMU: Geçersiz Teknik Servis maliyet ödeme durumu.';
        END IF;
    ELSE
        -- Teknik Servis harici kategorilerde servis maliyeti 0 ve status previously_paid_or_stock olarak normalize edilir
        NEW.service_cost_kurus := 0;
        NEW.service_cost_payment_status := 'previously_paid_or_stock';
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Trigger İzinleri
REVOKE ALL ON FUNCTION public.fn_kasa_validate_service_cost_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_validate_service_cost_status() TO service_role;

-- 4. Trigger Tanımlama
DROP TRIGGER IF EXISTS trg_kasa_validate_service_cost_status ON public.kasa_sales;

CREATE TRIGGER trg_kasa_validate_service_cost_status
BEFORE INSERT OR UPDATE OF category_id, service_cost_kurus, service_cost_payment_status
ON public.kasa_sales
FOR EACH ROW
EXECUTE FUNCTION public.fn_kasa_validate_service_cost_status();

COMMIT;
