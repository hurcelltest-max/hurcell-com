DO $$ 
BEGIN
    -- 1. Enum Türleri
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_status') THEN
        CREATE TYPE public.batch_status AS ENUM ('completed', 'rolled_back', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_action_type') THEN
        CREATE TYPE public.batch_action_type AS ENUM (
            'markup', 'margin', 
            'flat_increase', 'flat_decrease', 
            'percent_increase', 'percent_decrease', 
            'currency_update'
        );
    END IF;

    -- 2. Mevcut Fiyatların NOT NULL Yapılması
    ALTER TABLE public.products ALTER COLUMN buy_price SET NOT NULL;
    ALTER TABLE public.products ALTER COLUMN sell_price SET NOT NULL;

    -- 3. Döviz Kolonları ve Zorunlu Değerler
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS buy_currency text;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS foreign_buy_price numeric;

    UPDATE public.products SET buy_currency = 'TRY' WHERE buy_currency IS NULL;
    ALTER TABLE public.products ALTER COLUMN buy_currency SET DEFAULT 'TRY';
    ALTER TABLE public.products ALTER COLUMN buy_currency SET NOT NULL;

    -- 4. Doğru İlişkisel Constraint Kontrolü
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_currency_foreign_price' AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT check_currency_foreign_price 
        CHECK (
          (buy_currency = 'TRY' AND foreign_buy_price IS NULL) OR 
          (buy_currency IN ('USD', 'EUR') AND foreign_buy_price > 0)
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_positive_prices' AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT check_positive_prices 
        CHECK (buy_price >= 0 AND sell_price >= 0);
    END IF;

    -- 5. İşlem Tabloları
    CREATE TABLE IF NOT EXISTS public.price_update_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id uuid NOT NULL REFERENCES auth.users(id),
        action_type public.batch_action_type NOT NULL,
        parameters jsonb NOT NULL,
        status public.batch_status NOT NULL DEFAULT 'completed',
        rolled_back_at timestamp with time zone,
        rolled_back_by uuid REFERENCES auth.users(id),
        created_at timestamp with time zone NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.price_update_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id uuid NOT NULL REFERENCES public.price_update_batches(id),
        product_id uuid NOT NULL REFERENCES public.products(id),
        old_buy_currency text NOT NULL,
        old_foreign_buy_price numeric,
        old_buy_price numeric NOT NULL,
        old_sell_price numeric NOT NULL,
        new_buy_currency text NOT NULL,
        new_foreign_buy_price numeric,
        new_buy_price numeric NOT NULL,
        new_sell_price numeric NOT NULL,
        UNIQUE(batch_id, product_id)
    );

    ALTER TABLE public.price_update_batches ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.price_update_items ENABLE ROW LEVEL SECURITY;

    -- 6. GIN ve B-Tree İndeksleri
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON public.products USING GIN (name gin_trgm_ops, brand gin_trgm_ops, model gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode);

END $$;

-- 7. Update RPC (Yeni Kontrollerle Birlikte)
CREATE OR REPLACE FUNCTION public.execute_bulk_price_update(
    p_admin_user_id uuid,
    p_action_type public.batch_action_type,
    p_parameters jsonb,
    p_items jsonb 
) 
RETURNS uuid 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_batch_id uuid;
    v_item record;
    v_product record;
    v_item_count int;
BEGIN
    -- Ekstra doğrulama: p_items JSON array olmalı ve boş/çok büyük olmamalı
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
        RAISE EXCEPTION 'Geçersiz ürün listesi.';
    END IF;

    v_item_count := jsonb_array_length(p_items);
    IF v_item_count = 0 OR v_item_count > 1000 THEN
        RAISE EXCEPTION 'Güncellenecek ürün sayısı % limitlerin dışında (1-1000).', v_item_count;
    END IF;

    -- Duplicate check in JSON
    IF (SELECT count(*) FROM (SELECT DISTINCT x.product_id FROM jsonb_to_recordset(p_items) AS x(product_id uuid)) t) != v_item_count THEN
        RAISE EXCEPTION 'Bir ürün listede birden fazla kez geçiyor.';
    END IF;

    INSERT INTO public.price_update_batches (admin_user_id, action_type, parameters)
    VALUES (p_admin_user_id, p_action_type, p_parameters)
    RETURNING id INTO v_batch_id;

    FOR v_item IN (
        SELECT * FROM jsonb_to_recordset(p_items) AS x(
            product_id uuid, 
            expected_old_buy_currency text,
            expected_old_foreign_buy_price numeric,
            expected_old_buy_price numeric, 
            expected_old_sell_price numeric,
            new_buy_currency text,
            new_foreign_buy_price numeric,
            new_buy_price numeric,
            new_sell_price numeric
        ) ORDER BY product_id
    )
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ürün bulunamadı: %', v_item.product_id;
        END IF;

        IF (v_product.buy_currency IS DISTINCT FROM v_item.expected_old_buy_currency) OR
           (v_product.foreign_buy_price IS DISTINCT FROM v_item.expected_old_foreign_buy_price) OR
           (v_product.buy_price IS DISTINCT FROM v_item.expected_old_buy_price) OR
           (v_product.sell_price IS DISTINCT FROM v_item.expected_old_sell_price) THEN
            RAISE EXCEPTION 'Fiyatlar eşleşmiyor. Lütfen önizlemeyi yenileyin. Ürün ID: %', v_item.product_id;
        END IF;

        INSERT INTO public.price_update_items (
            batch_id, product_id,
            old_buy_currency, old_foreign_buy_price, old_buy_price, old_sell_price,
            new_buy_currency, new_foreign_buy_price, new_buy_price, new_sell_price
        ) VALUES (
            v_batch_id, v_item.product_id,
            v_product.buy_currency, v_product.foreign_buy_price, v_product.buy_price, v_product.sell_price,
            v_item.new_buy_currency, v_item.new_foreign_buy_price, v_item.new_buy_price, v_item.new_sell_price
        );

        UPDATE public.products 
        SET buy_currency = v_item.new_buy_currency,
            foreign_buy_price = v_item.new_foreign_buy_price,
            buy_price = v_item.new_buy_price,
            sell_price = v_item.new_sell_price
        WHERE id = v_item.product_id;
    END LOOP;

    RETURN v_batch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.execute_bulk_price_update(uuid, public.batch_action_type, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_bulk_price_update(uuid, public.batch_action_type, jsonb, jsonb) TO service_role;

-- 8. Rollback RPC
CREATE OR REPLACE FUNCTION public.rollback_price_batch(
    p_batch_id uuid,
    p_admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_batch record;
    v_item record;
    v_product record;
BEGIN
    SELECT * INTO v_batch FROM public.price_update_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'İşlem bulunamadı.';
    END IF;
    
    IF v_batch.status != 'completed' THEN
        RAISE EXCEPTION 'Sadece completed statüsündeki işlemler geri alınabilir.';
    END IF;

    FOR v_item IN (SELECT * FROM public.price_update_items WHERE batch_id = p_batch_id ORDER BY product_id)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Rollback iptal edildi: Ürün bulunamadı (ID: %)', v_item.product_id;
        END IF;
        
        IF (v_product.buy_currency IS DISTINCT FROM v_item.new_buy_currency) OR 
           (v_product.foreign_buy_price IS DISTINCT FROM v_item.new_foreign_buy_price) OR 
           (v_product.buy_price IS DISTINCT FROM v_item.new_buy_price) OR 
           (v_product.sell_price IS DISTINCT FROM v_item.new_sell_price) THEN
            RAISE EXCEPTION 'Rollback iptal edildi: % kodlu ürünün fiyatı son işlemden sonra dışarıdan değiştirilmiş.', v_item.product_id;
        END IF;

        UPDATE public.products 
        SET buy_currency = v_item.old_buy_currency,
            foreign_buy_price = v_item.old_foreign_buy_price,
            buy_price = v_item.old_buy_price,
            sell_price = v_item.old_sell_price
        WHERE id = v_item.product_id;
    END LOOP;

    UPDATE public.price_update_batches 
    SET status = 'rolled_back', rolled_back_at = now(), rolled_back_by = p_admin_user_id
    WHERE id = p_batch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollback_price_batch(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_price_batch(uuid, uuid) TO service_role;


-- 9. Arama RPC
CREATE OR REPLACE FUNCTION public.search_products(p_search_term text, p_limit int)
RETURNS TABLE (
  id uuid,
  name text,
  brand text,
  model text,
  barcode text,
  buy_price numeric,
  sell_price numeric,
  buy_currency text,
  foreign_buy_price numeric,
  image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_search_term IS NULL OR length(trim(p_search_term)) < 3 THEN
        RAISE EXCEPTION 'Arama kelimesi en az 3 karakter olmalıdır.';
    END IF;

    IF p_limit > 10 OR p_limit < 1 THEN
        RAISE EXCEPTION 'Limit 1 ile 10 arasında olmalıdır.';
    END IF;

    RETURN QUERY
    SELECT 
      p.id, p.name, p.brand, p.model, p.barcode, 
      p.buy_price, p.sell_price, p.buy_currency, p.foreign_buy_price, p.image_url
    FROM public.products p
    WHERE p.barcode = p_search_term
       OR p.name ILIKE '%' || p_search_term || '%'
       OR p.brand ILIKE '%' || p_search_term || '%'
       OR p.model ILIKE '%' || p_search_term || '%'
    LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_products(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(text, int) TO service_role;
