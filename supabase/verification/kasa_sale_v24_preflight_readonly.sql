-- ============================================================================
-- PREFLIGHT READ-ONLY: KASA V24 NORMAL CATEGORY SERVICE COST STATUS
-- Target Database: Production Supabase (ufazfmosiywlskjlzach)
-- ============================================================================

SELECT jsonb_build_object(
    'kasa_sales_service_cost_payment_status_nullable', (
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'kasa_sales' 
          AND column_name = 'service_cost_payment_status'
    ),
    'kasa_sales_service_cost_payment_status_default', (
        SELECT column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'kasa_sales' 
          AND column_name = 'service_cost_payment_status'
    ),
    'rpc_create_sale_33_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_create_sale' 
              AND pronargs = 33
        )
    ),
    'rpc_update_sale_33_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_update_sale' 
              AND pronargs = 33
        )
    ),
    'total_active_categories', (
        SELECT count(*) FROM public.kasa_categories WHERE is_active IS TRUE
    )
) AS preflight_result;
