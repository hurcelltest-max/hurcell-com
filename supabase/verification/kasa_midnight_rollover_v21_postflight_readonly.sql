-- ============================================================================
-- HurCELL Kasa V21 - Postflight Read-Only Doğrulama
-- Amaç:
-- 1. fn_kasa_assert_active_day_for_mutation ve fn_kasa_get_or_create_open_day güncellendiğini doğrula.
-- 2. KASA_GUNU_TARIH_UYUSMAZLIGI ve yapay PREVIOUS_DAY_UNCLOSED kısıtlarının kalktığını doğrula.
-- 3. Fonksiyonların SECURITY DEFINER ve EXECUTE izinlerini (service_role tek) kontrol et.
-- 4. Bahar'ın kasa.expense.bank ve kasa.sale.cancel izinlerinin korunduğunu doğrula.
-- 5. Canlı 2026-09-21 açık gününün korunduğunu ve açık gün sayısının 1 olduğunu doğrula.
-- ============================================================================

WITH func_assert AS (
    SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_assert_active_day_for_mutation'
),
func_get_create AS (
    SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_get_or_create_open_day'
),
grants_assert AS (
    SELECT
        has_function_privilege('service_role', 'public.fn_kasa_assert_active_day_for_mutation(uuid)', 'EXECUTE') AS service_role_execute,
        has_function_privilege('anon', 'public.fn_kasa_assert_active_day_for_mutation(uuid)', 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', 'public.fn_kasa_assert_active_day_for_mutation(uuid)', 'EXECUTE') AS authenticated_execute,
        has_function_privilege('public', 'public.fn_kasa_assert_active_day_for_mutation(uuid)', 'EXECUTE') AS public_execute
),
grants_get_create AS (
    SELECT
        has_function_privilege('service_role', 'public.fn_kasa_get_or_create_open_day(uuid)', 'EXECUTE') AS service_role_execute,
        has_function_privilege('anon', 'public.fn_kasa_get_or_create_open_day(uuid)', 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', 'public.fn_kasa_get_or_create_open_day(uuid)', 'EXECUTE') AS authenticated_execute,
        has_function_privilege('public', 'public.fn_kasa_get_or_create_open_day(uuid)', 'EXECUTE') AS public_execute
),
bahar_perms AS (
    SELECT
        u.id AS bahar_id,
        u.username,
        u.role,
        u.is_active,
        EXISTS (
            SELECT 1 FROM public.kasa_user_permissions p
            WHERE p.user_id = u.id AND p.permission_key = 'kasa.expense.bank'
        ) AS has_bank_expense_perm,
        EXISTS (
            SELECT 1 FROM public.kasa_user_permissions p
            WHERE p.user_id = u.id AND p.permission_key = 'kasa.sale.cancel'
        ) AS has_sale_cancel_perm
    FROM public.kasa_users u
    WHERE u.username = 'bahar'
),
days_state AS (
    SELECT
        count(*) FILTER (WHERE status = 'open') AS open_day_count,
        (SELECT status FROM public.kasa_days WHERE date_val = '2026-09-21') AS day_2026_09_21_status
    FROM public.kasa_days
)
SELECT jsonb_pretty(jsonb_build_object(
    'timestamp_utc', now(),
    'istanbul_today', (now() AT TIME ZONE 'Europe/Istanbul')::date,
    'assert_fn_exists', (SELECT count(*) = 1 FROM func_assert),
    'assert_fn_no_date_mismatch_check', (SELECT funcdef NOT LIKE '%KASA_GUNU_TARIH_UYUSMAZLIGI%' FROM func_assert),
    'assert_fn_has_chronology_check', (SELECT funcdef LIKE '%GEÇMİŞ_GÜN_İŞLEM_YAPILAMAZ%' FROM func_assert),
    'get_create_fn_exists', (SELECT count(*) = 1 FROM func_get_create),
    'get_create_fn_returns_active_open_day', (SELECT funcdef LIKE '%RETURN to_jsonb(v_open_day);%' FROM func_get_create),
    'permissions_ok', (
        (SELECT service_role_execute AND NOT anon_execute AND NOT authenticated_execute AND NOT public_execute FROM grants_assert) AND
        (SELECT service_role_execute AND NOT anon_execute AND NOT authenticated_execute AND NOT public_execute FROM grants_get_create)
    ),
    'bahar_permissions_preserved', (
        SELECT jsonb_build_object(
            'username', username,
            'role', role,
            'is_active', is_active,
            'has_bank_expense_perm', has_bank_expense_perm,
            'has_sale_cancel_perm', has_sale_cancel_perm
        ) FROM bahar_perms
    ),
    'day_status_summary', (
        SELECT jsonb_build_object(
            'open_day_count', open_day_count,
            'day_2026_09_21_status', day_2026_09_21_status
        ) FROM days_state
    ),
    'overall_ok', (
        (SELECT count(*) = 1 FROM func_assert) AND
        (SELECT prosecdef FROM func_assert) AND
        (SELECT funcdef NOT LIKE '%KASA_GUNU_TARIH_UYUSMAZLIGI%' FROM func_assert) AND
        (SELECT count(*) = 1 FROM func_get_create) AND
        (SELECT prosecdef FROM func_get_create) AND
        (SELECT funcdef LIKE '%RETURN to_jsonb(v_open_day);%' FROM func_get_create) AND
        (SELECT service_role_execute AND NOT anon_execute AND NOT authenticated_execute AND NOT public_execute FROM grants_assert) AND
        (SELECT service_role_execute AND NOT anon_execute AND NOT authenticated_execute AND NOT public_execute FROM grants_get_create) AND
        (SELECT has_bank_expense_perm AND has_sale_cancel_perm FROM bahar_perms) AND
        (SELECT open_day_count = 1 AND day_2026_09_21_status = 'open' FROM days_state)
    )
));
