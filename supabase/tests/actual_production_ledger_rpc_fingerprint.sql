-- Read-only production fingerprint. Always returns exactly one row.
-- Target production function body is semantically identical to the
-- repository-tracked legacy function. The production variant only adds
-- number prefixes to eleven SQL line comments. The production database's
-- exact normalized MD5 is therefore used as the migration precondition.
WITH expected AS (
  SELECT
    'b7620bc75905ac461f37ab32fc0b430e'::text AS expected_md5,
    'CHECK ((source_type = ANY (ARRAY[''web_order''::text, ''store_sale''::text, ''service_fee''::text, ''print_fee''::text, ''technical_service_fee''::text, ''payment''::text, ''adjustment''::text, ''reversal''::text])))'::text
      AS expected_source_constraint
),
target AS (
  SELECT p.*, n.nspname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.oid=to_regprocedure(
    'public.add_credit_transaction(uuid,uuid,text,text,numeric,text,text,text,text,text,text,uuid,jsonb)')
),
source_constraint AS (
  SELECT pg_get_constraintdef(c.oid,false) AS definition, c.convalidated
  FROM pg_constraint c
  WHERE c.conrelid=to_regclass('public.credit_transactions')
    AND c.conname='chk_credit_transactions_source_type'
    AND c.contype='c'
)
SELECT
  (t.oid IS NOT NULL) AS function_exists,
  CASE WHEN t.oid IS NOT NULL THEN
    format('%I.%I(%s)', t.nspname, t.proname, pg_get_function_identity_arguments(t.oid))
  END AS exact_signature,
  CASE WHEN t.oid IS NOT NULL THEN pg_get_function_result(t.oid) END AS return_type,
  coalesce(t.prosecdef,false) AS security_definer,
  t.proconfig AS search_path,
  CASE WHEN t.oid IS NOT NULL THEN pg_get_userbyid(t.proowner) END AS owner_name,
  CASE WHEN t.oid IS NOT NULL
    THEN md5(regexp_replace(btrim(t.prosrc),'\s+',' ','g')) END AS normalized_prosrc_md5,
  e.expected_md5,
  coalesce(md5(regexp_replace(btrim(t.prosrc),'\s+',' ','g'))=e.expected_md5,false)
    AS body_match,
  sc.definition AS source_constraint_definition,
  coalesce(sc.convalidated,false) AS source_constraint_validated,
  coalesce(regexp_replace(sc.definition,'\s+',' ','g')=e.expected_source_constraint,false)
    AS source_constraint_match,
  (
    t.oid IS NOT NULL
    AND pg_get_function_result(t.oid) = 'jsonb'
    AND t.prosecdef
    AND EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL unnest(p.proconfig) c
      WHERE p.oid = t.oid AND replace(c,' ','') = 'search_path=public,pg_temp'
    )
    AND coalesce(md5(regexp_replace(btrim(t.prosrc),'\s+',' ','g'))=e.expected_md5,false)
    AND coalesce(sc.convalidated,false)
    AND coalesce(regexp_replace(sc.definition,'\s+',' ','g')=e.expected_source_constraint,false)
    AND NOT has_function_privilege('public', t.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', t.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', t.oid, 'EXECUTE')
    AND has_function_privilege('service_role', t.oid, 'EXECUTE')
  ) AS overall_ok
FROM expected e
LEFT JOIN target t ON true
LEFT JOIN source_constraint sc ON true;
