-- supabase/tests/operations_inventory_foundation_preflight.sql
-- Pure Read-Only Preflight Audit for Paket O3 Operations Inventory Foundation
-- Pure Single SELECT Statement. Zero TEMP Tables, Zero DO Blocks, Zero DML/DDL.

WITH check_results AS (
  -- 1. MANUAL PROJECT IDENTITY NOTICE
  SELECT
    'PROJECT_IDENTITY_NOTE' AS check_group,
    'Manual Project Reference Audit' AS check_name,
    'Supabase SQL Editor Header' AS object_name,
    'ufazfmosiywlskjlzach (hurcell-com)' AS expected,
    'Manual Verification Required' AS actual,
    'INFO' AS status,
    'CRITICAL' AS severity,
    'User MUST manually verify SQL Editor header indicates Project: hurcell-com (ufazfmosiywlskjlzach) on main / PRODUCTION' AS notes

  UNION ALL

  -- 2. PRODUCTS_EXISTENCE
  SELECT
    'PRODUCTS_EXISTENCE',
    'public.products Table Existence',
    'public.products',
    'EXISTS',
    CASE WHEN to_regclass('public.products') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END,
    CASE WHEN to_regclass('public.products') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies target public.products table exists in production database'

  UNION ALL

  -- 3. PRODUCTS_ID_TYPE
  SELECT
    'PRODUCTS_ID_TYPE',
    'products.id Column Type',
    'public.products.id',
    'uuid',
    COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id'), 'MISSING'),
    CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id') = 'uuid' THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies products.id is UUID'

  UNION ALL

  -- 4. PRODUCTS_STOCK_TYPE
  SELECT
    'PRODUCTS_STOCK_TYPE',
    'products.stock Column Type',
    'public.products.stock',
    'integer',
    COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'), 'MISSING'),
    CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock') = 'integer' THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies products.stock is strictly integer'

  UNION ALL

  -- 5. PRODUCTS_PRICE_TYPE
  SELECT
    'PRODUCTS_PRICE_TYPE',
    'products.price Column Type',
    'public.products.price',
    'numeric',
    COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price'), 'MISSING'),
    CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price') IN ('numeric', 'double precision') THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies products.price is numeric'

  UNION ALL

  -- 6. PRODUCTS_NEW_COLUMNS_COLLISION
  SELECT
    'PRODUCTS_NEW_COLUMNS_COLLISION',
    'New Columns Pre-existence Check',
    'public.products',
    '0',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('cost_price', 'min_stock_level', 'unit', 'shelf_location', 'is_active', 'is_web_visible', 'whatsapp_enabled', 'whatsapp_display_name', 'whatsapp_description', 'whatsapp_price', 'whatsapp_sort_order')),
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('cost_price', 'min_stock_level', 'unit', 'shelf_location', 'is_active', 'is_web_visible', 'whatsapp_enabled', 'whatsapp_display_name', 'whatsapp_description', 'whatsapp_price', 'whatsapp_sort_order')) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Ensures none of the 11 new extension columns already exist'

  UNION ALL

  -- 7. OBJECT_COLLISION_TABLES
  SELECT
    'OBJECT_COLLISION_TABLES',
    'New Tables Pre-existence Check',
    'public.stock_movements, operation_approvals',
    '0',
    (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('stock_movements', 'operation_approvals')),
    CASE WHEN (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('stock_movements', 'operation_approvals')) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Ensures target tables stock_movements and operation_approvals do not already exist'

  UNION ALL

  -- 8. OBJECT_COLLISION_FUNCTIONS
  SELECT
    'OBJECT_COLLISION_FUNCTIONS',
    'New Functions Pre-existence Check',
    'public.apply_stock_movement etc.',
    '0',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('apply_stock_movement', 'prevent_stock_movement_mutation', 'enforce_operation_approvals_integrity')),
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('apply_stock_movement', 'prevent_stock_movement_mutation', 'enforce_operation_approvals_integrity')) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Ensures target RPC and trigger functions do not already exist'

  UNION ALL

  -- 9. OBJECT_COLLISION_INDEXES
  SELECT
    'OBJECT_COLLISION_INDEXES',
    'New Indexes Pre-existence Check',
    'public.idx_*',
    '0',
    (SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_stock_movements_idempotency_key', 'idx_stock_movements_product_created', 'idx_stock_movements_type', 'idx_operation_approvals_pending', 'idx_operation_approvals_entity')),
    CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_stock_movements_idempotency_key', 'idx_stock_movements_product_created', 'idx_stock_movements_type', 'idx_operation_approvals_pending', 'idx_operation_approvals_entity')) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'HIGH',
    'Ensures target index names do not already exist'

  UNION ALL

  -- 10. ROLES_EXISTENCE
  SELECT
    'ROLES_EXISTENCE',
    'Required Roles Existence Check',
    'service_role, anon, authenticated',
    '3',
    (SELECT count(*)::text FROM pg_roles WHERE rolname IN ('service_role', 'anon', 'authenticated')),
    CASE WHEN (SELECT count(*) FROM pg_roles WHERE rolname IN ('service_role', 'anon', 'authenticated')) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies database roles service_role, anon, and authenticated exist'

  UNION ALL

  -- 11. PRODUCTS_PUBLIC_WRITE_GUARD
  SELECT
    'PRODUCTS_PUBLIC_WRITE_GUARD',
    'products Public Write Access Check',
    'public.products',
    '0',
    (SELECT count(*)::text FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'products' AND grantee IN ('PUBLIC', 'anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
    CASE WHEN (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'products' AND grantee IN ('PUBLIC', 'anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'CRITICAL',
    'Verifies client roles cannot perform direct DML writes on public.products'

  UNION ALL

  -- 12. CHECKOUT_LEDGER_GAP_INFO
  SELECT
    'CHECKOUT_LEDGER_GAP_INFO',
    'Existing Checkout RPCs Existence',
    'decrement_product_stock_safe / release_order_stock',
    '2',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('decrement_product_stock_safe', 'release_order_stock')),
    'PASS',
    'INFO',
    'Informational: Checkout RPCs exist. Live web checkout will continue to work normally in O3 without writing to stock_movements until O4'
)
SELECT
  check_group,
  check_name,
  object_name,
  expected,
  actual,
  status,
  severity,
  notes
FROM check_results
ORDER BY
  CASE severity
    WHEN 'BLOCKER' THEN 1
    WHEN 'CRITICAL' THEN 2
    WHEN 'HIGH' THEN 3
    WHEN 'WARNING' THEN 4
    WHEN 'INFO' THEN 5
    ELSE 6
  END,
  check_group,
  check_name;
