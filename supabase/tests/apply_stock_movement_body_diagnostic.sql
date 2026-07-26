-- supabase/tests/apply_stock_movement_body_diagnostic.sql
-- Pure Read-Only Body Diagnostic for public.apply_stock_movement RPC in Production DB
-- Pure Single SELECT Statement. Safe to_regprocedure. Zero RPC Invocation, Zero DML/DDL.

WITH target AS (
  SELECT to_regprocedure('public.apply_stock_movement(uuid,text,integer,text,text,text,uuid,text,text)') AS function_oid
),
proc_data AS (
  SELECT
    p.oid,
    'public.apply_stock_movement'::text AS function_name,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    pg_get_functiondef(p.oid) AS full_def,
    p.prosrc AS raw_src,
    p.prosecdef AS is_secdef,
    COALESCE(array_to_string(p.proconfig, ', '), 'NONE') AS search_path_cfg,
    pg_get_userbyid(p.proowner) AS func_owner,
    COALESCE(array_to_string(p.proacl, ', '), 'DEFAULT_GRANTS') AS func_acl
  FROM target t
  JOIN pg_proc p ON p.oid = t.function_oid
),
normalized_proc AS (
  SELECT
    *,
    regexp_replace(lower(COALESCE(raw_src, '')), '[[:space:]]+', ' ', 'g') AS norm_src
  FROM proc_data
)
SELECT
  'RPC_BODY_DIAGNOSTIC'::text AS diagnostic_section,
  COALESCE(n.oid::text, 'MISSING') AS function_oid,
  'public.apply_stock_movement'::text AS function_name,
  COALESCE(n.identity_args, 'MISSING') AS identity_arguments,
  COALESCE(n.full_def, 'MISSING') AS full_definition,
  COALESCE(n.raw_src, 'MISSING') AS raw_source,
  COALESCE(n.is_secdef::text, 'false') AS is_secdef,
  COALESCE(n.search_path_cfg, 'MISSING') AS search_path_cfg,
  COALESCE(n.func_owner, 'MISSING') AS function_owner,
  COALESCE(n.func_acl, 'MISSING') AS function_acl,
  (COALESCE(n.norm_src, '') LIKE '%for update%') AS has_for_update,
  (COALESCE(n.norm_src, '') LIKE '%from public.products%') AS has_products_reference,
  (COALESCE(n.norm_src, '') ~ 'select .* from public[.]products .* for update') AS has_products_row_lock,
  (COALESCE(n.norm_src, '') LIKE '%update public.products%') AS has_update_products,
  (COALESCE(n.norm_src, '') LIKE '%insert into public.stock_movements%') AS has_insert_stock_movements,
  (COALESCE(n.norm_src, '') LIKE '%v_new_stock < 0%') AS has_negative_stock_guard,
  (COALESCE(n.norm_src, '') LIKE '%idempotency_key%') AS has_idempotency_lookup,
  CASE WHEN n.oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  CASE WHEN n.oid IS NOT NULL THEN 'Function metadata successfully retrieved' ELSE 'Exact function signature missing' END AS notes
FROM target t
LEFT JOIN normalized_proc n ON true;
