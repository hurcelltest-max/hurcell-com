-- ============================================================================
-- HurCELL Kasa V20 - Postflight Read-Only Doğrulama
-- Amaç:
-- 1. Partial unique index (uq_kasa_days_single_open) varlığını doğrula.
-- 2. fn_kasa_reopen_day RPC fonksiyonunun varlığı, imza doğruluğu ve SECURITY DEFINER durumunu kontrol et.
-- 3. Fonksiyon gövdesinde advisory kilit, veri bütünlüğü, tek açık gün ve kronoloji kontrollerini doğrula.
-- 4. Fonksiyonun EXECUTE izinlerini (service_role tek, anon/authenticated/public yok) kontrol et.
-- 5. Bahar'ın kasa.expense.bank ve kasa.sale.cancel yetkilerinin korunduğunu doğrula.
-- 6. Açık gün sayısının ve 2026-09-21 kapalı gün durumunun korunduğunu doğrula.
-- ============================================================================

WITH function_info AS (
    SELECT
        p.oid,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        p.prosecdef AS is_secdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_reopen_day'
),
index_info AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'kasa_days'
              AND indexname = 'uq_kasa_days_single_open'
        ) AS unique_index_exists
),
grants_info AS (
    SELECT
        has_function_privilege('service_role', 'public.fn_kasa_reopen_day(uuid, uuid, text)', 'EXECUTE') AS service_role_execute,
        has_function_privilege('anon', 'public.fn_kasa_reopen_day(uuid, uuid, text)', 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', 'public.fn_kasa_reopen_day(uuid, uuid, text)', 'EXECUTE') AS authenticated_execute,
        has_function_privilege('public', 'public.fn_kasa_reopen_day(uuid, uuid, text)', 'EXECUTE') AS public_execute
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
    WHERE u.id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
       OR u.username = 'bahar'
),
days_state AS (
    SELECT
        count(*) FILTER (WHERE status = 'open') AS open_day_count,
        (SELECT status FROM public.kasa_days WHERE date_val = '2026-09-21') AS day_2026_09_21_status
    FROM public.kasa_days
)
SELECT jsonb_pretty(jsonb_build_object(
    'timestamp', now(),
    'rpc_exists', (SELECT count(*) = 1 FROM function_info),
    'args_match', (SELECT identity_args = 'p_actor_user_id uuid, p_kasa_day_id uuid, p_justification text' FROM function_info),
    'is_security_definer', (SELECT is_secdef FROM function_info),
    'has_advisory_lock', (SELECT funcdef LIKE '%pg_advisory_xact_lock%' FROM function_info),
    'has_data_integrity_check', (SELECT funcdef LIKE '%VERİ_BÜTÜNLÜĞÜ_HATASI%' FROM function_info),
    'has_single_open_day_check', (SELECT funcdef LIKE '%BAŞKA_GÜN_AÇIK%' FROM function_info),
    'has_chronology_check', (SELECT funcdef LIKE '%GEÇMİŞ_GÜN_AÇILAMAZ%' FROM function_info),
    'has_audit_log', (SELECT funcdef LIKE '%gun_yeniden_acildi%' FROM function_info),
    'partial_unique_index_exists', (SELECT unique_index_exists FROM index_info),
    'permissions', (
        SELECT jsonb_build_object(
            'service_role_execute', service_role_execute,
            'no_anon_execute', NOT anon_execute,
            'no_auth_execute', NOT authenticated_execute,
            'no_public_execute', NOT public_execute
        ) FROM grants_info
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
        (SELECT count(*) = 1 FROM function_info) AND
        (SELECT is_secdef FROM function_info) AND
        (SELECT unique_index_exists FROM index_info) AND
        (SELECT funcdef LIKE '%pg_advisory_xact_lock%' FROM function_info) AND
        (SELECT funcdef LIKE '%VERİ_BÜTÜNLÜĞÜ_HATASI%' FROM function_info) AND
        (SELECT funcdef LIKE '%BAŞKA_GÜN_AÇIK%' FROM function_info) AND
        (SELECT service_role_execute AND NOT anon_execute AND NOT authenticated_execute AND NOT public_execute FROM grants_info) AND
        (SELECT has_bank_expense_perm AND has_sale_cancel_perm FROM bahar_perms) AND
        (SELECT day_2026_09_21_status = 'closed' FROM days_state)
    )
));
