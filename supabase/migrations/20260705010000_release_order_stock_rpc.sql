-- 20260705010000_release_order_stock_rpc.sql
-- Safely release order stock within a single transaction

CREATE OR REPLACE FUNCTION public.release_order_stock(p_order_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_result JSONB;
BEGIN
    -- 1. Lock the order row for update
    SELECT id, stock_reserved_at, stock_released_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sipariş bulunamadı.');
    END IF;

    -- 2. Check if stock was reserved
    IF v_order.stock_reserved_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu siparişte stok ayrılmamış.');
    END IF;

    -- 3. Check if stock is already released (Idempotency)
    IF v_order.stock_released_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Stok daha önce iade edilmiş.');
    END IF;

    -- 4. Iterate over order items and restore stock
    FOR v_item IN (SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id) LOOP
        IF v_item.product_id IS NOT NULL AND v_item.quantity > 0 THEN
            UPDATE public.products
            SET stock = stock + v_item.quantity
            WHERE id = v_item.product_id;
            
            -- If product not found or update fails, the whole transaction will rollback on exception, 
            -- but we can explicitly check if FOUND.
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Product % not found for restock', v_item.product_id;
            END IF;
        END IF;
    END LOOP;

    -- 5. Update order stock release status
    UPDATE public.orders
    SET stock_released_at = NOW(),
        stock_release_reason = p_reason
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Stok başarıyla iade edildi.');

EXCEPTION WHEN OTHERS THEN
    -- Any error rolls back the entire transaction automatically
    RETURN jsonb_build_object('success', false, 'message', 'Stok iadesi sırasında bir hata oluştu: ' || SQLERRM);
END;
$$;

-- Secure the RPC
REVOKE ALL ON FUNCTION public.release_order_stock(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_order_stock(UUID, TEXT) TO service_role;
