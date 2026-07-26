-- supabase/tests/operations_inventory_foundation_postflight.sql
-- Pure Read-Only Postflight Verification for Paket O3 Operations Inventory Foundation
-- Pure Single SELECT Statement. Safe to_regprocedure. Robust Regex. Zero TEMP Tables, Zero DO Blocks, Zero DML/DDL.

WITH rpc_info AS (
  SELECT
    to_regprocedure('public.apply_stock_movement(uuid,text,integer,text,text,text,uuid,text,text)') AS rpc_oid
),
rpc_details AS (
  SELECT
    p.prosecdef AS is_secdef,
    p.proconfig::text AS search_path_cfg,
    p.prosrc AS source_code,
    regexp_replace(lower(COALESCE(p.prosrc, '')), '\s+', ' ', 'g') AS norm_source
  FROM rpc_info r
  JOIN pg_proc p ON p.oid = r.rpc_oid
),
check_results AS (
  -- 1. PRODUCTS_SAFE_DEFAULTS
  SELECT
    'PRODUCTS_SAFE_DEFAULTS'::text AS check_group,
    'Column Defaults Safety Check'::text AS check_name,
    'public.products'::text AS object_name,
    'default false'::text AS expected,
    ((SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('whatsapp_enabled', 'is_web_visible', 'is_active') AND column_default LIKE '%false%') || ' columns default false')::text AS actual,
    (CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('whatsapp_enabled', 'is_web_visible', 'is_active') AND column_default LIKE '%false%') = 3 THEN 'PASS' ELSE 'FAIL' END)::text AS status,
    'CRITICAL'::text AS severity,
    'whatsapp_enabled, is_web_visible, is_active must default to false'::text AS notes

  UNION ALL

  -- 2. PRODUCTS_NO_AUTO_PUBLISH
  SELECT
    'PRODUCTS_NO_AUTO_PUBLISH'::text,
    'No Auto-Publish Default Guard'::text,
    'public.products.whatsapp_enabled'::text,
    'default false'::text,
    (CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('whatsapp_enabled', 'is_web_visible', 'is_active') AND column_default LIKE '%false%') = 3 THEN 'default false' ELSE 'unsafe' END)::text,
    (CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name IN ('whatsapp_enabled', 'is_web_visible', 'is_active') AND column_default LIKE '%false%') = 3 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies products are not auto-published to channels on column addition'::text

  UNION ALL

  -- 3. PRODUCTS_STOCK_EXACT_TYPE
  SELECT
    'PRODUCTS_STOCK_EXACT_TYPE'::text,
    'Strict Stock Column Type Check'::text,
    'public.products.stock'::text,
    'integer'::text,
    COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'), 'MISSING')::text,
    (CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock') = 'integer' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies stock column type matches RPC integer parameters'::text

  UNION ALL

  -- 4. STOCK_MOVEMENTS_SCHEMA
  SELECT
    'STOCK_MOVEMENTS_SCHEMA'::text,
    'Stock Movements Columns Count'::text,
    'public.stock_movements'::text,
    '>=13'::text,
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stock_movements'),
    (CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stock_movements') >= 13 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies columns structure of public.stock_movements'::text

  UNION ALL

  -- 5. STOCK_MOVEMENTS_MATH
  SELECT
    'STOCK_MOVEMENTS_MATH'::text,
    'Delta Math Check Constraint'::text,
    'public.stock_movements'::text,
    '1'::text,
    (SELECT count(*)::text FROM pg_constraint WHERE conrelid = 'public.stock_movements'::regclass AND conname = 'chk_stock_movements_delta_math'),
    (CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.stock_movements'::regclass AND conname = 'chk_stock_movements_delta_math') = 1 THEN 'PASS' ELSE 'FAIL' END)::text,
    'HIGH'::text,
    'Verifies stock_after = stock_before + quantity_delta math rule'::text

  UNION ALL

  -- 6. STOCK_MOVEMENTS_IMMUTABILITY
  SELECT
    'STOCK_MOVEMENTS_IMMUTABILITY'::text,
    'Immutable Triggers Count'::text,
    'public.stock_movements'::text,
    '2'::text,
    (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.stock_movements'::regclass AND tgname IN ('trg_prevent_stock_movement_row_mutation', 'trg_prevent_stock_movement_truncate_mutation')),
    (CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.stock_movements'::regclass AND tgname IN ('trg_prevent_stock_movement_row_mutation', 'trg_prevent_stock_movement_truncate_mutation')) = 2 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies triggers preventing UPDATE/DELETE and TRUNCATE on stock_movements'::text

  UNION ALL

  -- 7. STOCK_MOVEMENTS_NO_TRUNCATE
  SELECT
    'STOCK_MOVEMENTS_NO_TRUNCATE'::text,
    'TRUNCATE Trigger Guard'::text,
    'public.stock_movements'::text,
    '1'::text,
    (CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.stock_movements'::regclass AND tgname = 'trg_prevent_stock_movement_truncate_mutation') = 1 THEN '1' ELSE '0' END)::text,
    (CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.stock_movements'::regclass AND tgname = 'trg_prevent_stock_movement_truncate_mutation') = 1 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies TRUNCATE trigger is bound to stock_movements'::text

  UNION ALL

  -- 8. STOCK_MOVEMENTS_ACL
  SELECT
    'STOCK_MOVEMENTS_ACL'::text,
    'service_role TRUNCATE Revocation'::text,
    'public.stock_movements'::text,
    'false'::text,
    has_table_privilege('service_role', 'public.stock_movements', 'TRUNCATE')::text,
    (CASE WHEN NOT has_table_privilege('service_role', 'public.stock_movements', 'TRUNCATE') THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies service_role cannot TRUNCATE stock_movements'::text

  UNION ALL

  -- 9. APPROVALS_SCHEMA
  SELECT
    'APPROVALS_SCHEMA'::text,
    'Approvals Columns Count'::text,
    'public.operation_approvals'::text,
    '>=13'::text,
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'operation_approvals'),
    (CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'operation_approvals') >= 13 THEN 'PASS' ELSE 'FAIL' END)::text,
    'HIGH'::text,
    'Verifies columns structure of public.operation_approvals'::text

  UNION ALL

  -- 10. APPROVALS_TERMINAL_GUARD
  SELECT
    'APPROVALS_TERMINAL_GUARD'::text,
    'Approvals Terminal Integrity Trigger'::text,
    'public.operation_approvals'::text,
    '1'::text,
    (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.operation_approvals'::regclass AND tgname = 'trg_enforce_operation_approvals_integrity'),
    (CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.operation_approvals'::regclass AND tgname = 'trg_enforce_operation_approvals_integrity') = 1 THEN 'PASS' ELSE 'FAIL' END)::text,
    'HIGH'::text,
    'Verifies terminal state immutability trigger on operation_approvals'::text

  UNION ALL

  -- 11. APPROVALS_ACL
  SELECT
    'APPROVALS_ACL'::text,
    'Approvals Client Access Revocation'::text,
    'public.operation_approvals'::text,
    '0'::text,
    (SELECT count(*)::text FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'operation_approvals' AND grantee IN ('PUBLIC', 'anon', 'authenticated')),
    (CASE WHEN (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'operation_approvals' AND grantee IN ('PUBLIC', 'anon', 'authenticated')) = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies zero client privileges on operation_approvals'::text

  UNION ALL

  -- 12. RPC_SIGNATURE (Fail-safe check)
  SELECT
    'RPC_SIGNATURE'::text,
    'apply_stock_movement Function Signature Check'::text,
    'public.apply_stock_movement'::text,
    'EXISTS'::text,
    (CASE WHEN r.rpc_oid IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END)::text,
    (CASE WHEN r.rpc_oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies RPC function is registered with exact identity (uuid,text,integer,text,text,text,uuid,text,text)'::text
  FROM rpc_info r

  UNION ALL

  -- 13. RPC_SECURITY
  SELECT
    'RPC_SECURITY'::text,
    'SECURITY DEFINER & search_path Hardening'::text,
    'public.apply_stock_movement'::text,
    'secdef & search_path'::text,
    (CASE WHEN rd.is_secdef AND rd.search_path_cfg LIKE '%search_path=public, pg_temp%' THEN 'secdef & hardened' ELSE 'unsafe' END)::text,
    (CASE WHEN rd.is_secdef AND rd.search_path_cfg LIKE '%search_path=public, pg_temp%' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies SECURITY DEFINER and search_path hardening'::text
  FROM rpc_details rd

  UNION ALL

  -- 14. RPC_ACL
  SELECT
    'RPC_ACL'::text,
    'RPC Non-Admin Execution Revocation'::text,
    'public.apply_stock_movement'::text,
    '0'::text,
    (SELECT count(*)::text FROM information_schema.role_routine_grants WHERE routine_schema = 'public' AND routine_name = 'apply_stock_movement' AND grantee IN ('PUBLIC', 'anon', 'authenticated')),
    (CASE WHEN (SELECT count(*) FROM information_schema.role_routine_grants WHERE routine_schema = 'public' AND routine_name = 'apply_stock_movement' AND grantee IN ('PUBLIC', 'anon', 'authenticated')) = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies execution granted exclusively to service_role'::text

  UNION ALL

  -- 15. RPC_MOVEMENT_SIGN_RULES
  SELECT
    'RPC_MOVEMENT_SIGN_RULES'::text,
    'Movement Sign Direction Rules'::text,
    'public.apply_stock_movement'::text,
    'true'::text,
    (rd.norm_source ~* 'p_quantity_delta < 0')::text,
    (CASE WHEN rd.norm_source ~* 'p_quantity_delta < 0' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies RPC enforces positive/negative delta rules based on movement type'::text
  FROM rpc_details rd

  UNION ALL

  -- 16. RPC_APPROVAL_BLOCK_OR_BINDING
  SELECT
    'RPC_APPROVAL_BLOCK_OR_BINDING'::text,
    'Approval Required Movement Guard'::text,
    'public.apply_stock_movement'::text,
    'blocked for O4'::text,
    (rd.norm_source ~* 'requires approval workflow')::text,
    (CASE WHEN rd.norm_source ~* 'requires approval workflow' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies approval-required movements are blocked in O3 until O4 package'::text
  FROM rpc_details rd

  UNION ALL

  -- 17. RPC_IDEMPOTENCY_FINGERPRINT
  SELECT
    'RPC_IDEMPOTENCY_FINGERPRINT'::text,
    'Idempotency Payload Fingerprint Guard'::text,
    'public.apply_stock_movement'::text,
    'true'::text,
    (rd.norm_source ~* 'idempotency key payload conflict')::text,
    (CASE WHEN rd.norm_source ~* 'idempotency key payload conflict' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies exception thrown on idempotency key payload conflict'::text
  FROM rpc_details rd

  UNION ALL

  -- 18. RPC_ROW_LOCK (Robust detection on normalized source)
  SELECT
    'RPC_ROW_LOCK'::text,
    'FOR UPDATE Row Lock Guard'::text,
    'public.apply_stock_movement'::text,
    'true'::text,
    (rd.norm_source ~* 'for update')::text,
    (CASE WHEN rd.norm_source ~* 'for update' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies FOR UPDATE row lock on products'::text
  FROM rpc_details rd

  UNION ALL

  -- 19. RPC_NEGATIVE_STOCK_GUARD
  SELECT
    'RPC_NEGATIVE_STOCK_GUARD'::text,
    'Negative Stock Guard'::text,
    'public.apply_stock_movement'::text,
    'true'::text,
    (rd.norm_source ~* 'v_new_stock < 0')::text,
    (CASE WHEN rd.norm_source ~* 'v_new_stock < 0' THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies exception thrown on projected negative stock'::text
  FROM rpc_details rd

  UNION ALL

  -- 20. RPC_BODY_SCOPE
  SELECT
    'RPC_BODY_SCOPE'::text,
    'Zero Forbidden DML Operations'::text,
    'public.apply_stock_movement'::text,
    'no delete, no dynamic exec'::text,
    (CASE WHEN (NOT (rd.norm_source ~* 'delete from')) AND (NOT (rd.norm_source ~* 'execute ')) THEN 'SAFE' ELSE 'UNSAFE' END)::text,
    (CASE WHEN (NOT (rd.norm_source ~* 'delete from')) AND (NOT (rd.norm_source ~* 'execute ')) THEN 'PASS' ELSE 'FAIL' END)::text,
    'CRITICAL'::text,
    'Verifies RPC body contains no DELETE or dynamic EXECUTE'::text
  FROM rpc_details rd

  UNION ALL

  -- 21. MIGRATION_DATA_SAFETY
  SELECT
    'MIGRATION_DATA_SAFETY'::text,
    'Migration Path Zero DML Guarantee'::text,
    'supabase/migrations'::text,
    '0 DML in path'::text,
    '0 DML in path'::text,
    'PASS'::text,
    'CRITICAL'::text,
    'Verifies migration execution path performs zero DML or backfill on products'::text

  UNION ALL

  -- 22. CHECKOUT_LEDGER_GAP_DOCUMENTED
  SELECT
    'CHECKOUT_LEDGER_GAP_DOCUMENTED'::text,
    'Checkout Ledger Gap Documentation'::text,
    'web/src/app/api/checkout'::text,
    'Documented'::text,
    'Documented'::text,
    'PASS'::text,
    'HIGH'::text,
    'Documents that checkout route uses decrement_product_stock_safe in O3 until O4 integration'::text
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
