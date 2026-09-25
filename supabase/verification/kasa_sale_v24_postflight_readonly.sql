-- ============================================================================
-- POSTFLIGHT READ-ONLY: KASA V24 NORMAL CATEGORY SERVICE COST STATUS
-- Target Database: Production Supabase (ufazfmosiywlskjlzach)
-- ============================================================================

SELECT jsonb_build_object(
    'rpc_create_sale_33_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_create_sale' 
              AND pronargs = 33
        )
    ),
    'rpc_create_sale_32_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_create_sale' 
              AND pronargs = 32
        )
    ),
    'rpc_update_sale_34_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_update_sale' 
              AND p.pronargs = 34
        )
    ),
    'rpc_update_sale_33_exists', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_update_sale' 
              AND p.pronargs = 33
        )
    ),
    'rpc_security_definer_check', (
        SELECT bool_and(prosecdef)
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' 
          AND p.proname IN ('fn_kasa_create_sale', 'fn_kasa_update_sale')
    ),
    'overall_ok', (
        SELECT EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_create_sale' 
              AND pronargs = 33
        )
        AND EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_kasa_update_sale' 
              AND pronargs = 33
        )
    )
) AS postflight_result;
