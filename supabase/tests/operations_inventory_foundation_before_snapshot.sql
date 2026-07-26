-- supabase/tests/operations_inventory_foundation_before_snapshot.sql
-- Static Metadata Snapshot before applying Paket O3 Migration
-- Read-Only Metadata Snapshot ONLY. Zero Row Data, Zero PII, Zero DML.

BEGIN;

-- 1. Snapshot of public.products columns
SELECT 'COLUMNS_SNAPSHOT' AS section, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;

-- 2. Snapshot of public.products constraints
SELECT 'CONSTRAINTS_SNAPSHOT' AS section, conname AS constraint_name, contype AS constraint_type, pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.products'::regclass;

-- 3. Snapshot of public.products indexes
SELECT 'INDEXES_SNAPSHOT' AS section, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'products';

-- 4. Snapshot of public.products RLS status & policies
SELECT 'RLS_SNAPSHOT' AS section, tablename, policyname, roles::text, cmd, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products';

-- 5. Snapshot of target objects existence check
SELECT 'OBJECT_EXISTENCE_SNAPSHOT' AS section, object_name, object_type, status
FROM (
  SELECT 'public.products' AS object_name, 'TABLE' AS object_type, CASE WHEN to_regclass('public.products') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
  UNION ALL
  SELECT 'public.stock_movements', 'TABLE', CASE WHEN to_regclass('public.stock_movements') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
  UNION ALL
  SELECT 'public.operation_approvals', 'TABLE', CASE WHEN to_regclass('public.operation_approvals') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
  UNION ALL
  SELECT 'public.apply_stock_movement', 'FUNCTION', CASE WHEN to_regprocedure('public.apply_stock_movement(uuid,text,integer,text,text,text,uuid,uuid,text)') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
  UNION ALL
  SELECT 'public.decrement_product_stock_safe', 'FUNCTION', CASE WHEN to_regprocedure('public.decrement_product_stock_safe(uuid,integer)') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
  UNION ALL
  SELECT 'public.release_order_stock', 'FUNCTION', CASE WHEN to_regprocedure('public.release_order_stock(uuid,text)') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
) AS t;

ROLLBACK;
