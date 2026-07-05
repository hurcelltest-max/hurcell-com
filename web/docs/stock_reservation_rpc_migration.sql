-- =============================================================
-- HurCELL - Atomic Stock Reservation RPC Migration
-- =============================================================
-- Amaç:
--   Sipariş oluşturulurken stoku atomik olarak düşürmek.
--   Aynı anda gelen iki siparişte yalnızca biri stok düşebilir.
--   İptal/iade/teslim edilemedi durumunda stok güvenli geri eklenir.
--
-- GÜVENLİK:
--   - DROP / DELETE / TRUNCATE YOK
--   - Ürün verisi silinmez
--   - p_qty NULL / 0 / negatif olamaz
--   - SECURITY DEFINER için search_path sabitlenmiştir
-- =============================================================

CREATE OR REPLACE FUNCTION public.decrement_product_stock_safe(
  p_product_id UUID,
  p_qty        INTEGER
)
RETURNS TABLE(success BOOLEAN, new_stock INTEGER, product_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock INTEGER;
  v_name      TEXT;
BEGIN
  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.products
  SET stock = stock - p_qty,
      updated_at = NOW()
  WHERE id = p_product_id
    AND stock >= p_qty
  RETURNING stock, name INTO v_new_stock, v_name;

  IF v_new_stock IS NULL THEN
    SELECT name INTO v_name FROM public.products WHERE id = p_product_id;
    RETURN QUERY SELECT FALSE, NULL::INTEGER, v_name;
  ELSE
    RETURN QUERY SELECT TRUE, v_new_stock, v_name;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_product_stock_safe(
  p_product_id UUID,
  p_qty        INTEGER
)
RETURNS TABLE(success BOOLEAN, new_stock INTEGER, product_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock INTEGER;
  v_name      TEXT;
BEGIN
  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.products
  SET stock = stock + p_qty,
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING stock, name INTO v_new_stock, v_name;

  IF v_new_stock IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, v_new_stock, v_name;
  END IF;
END;
$$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_reserved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_release_reason TEXT DEFAULT NULL;
