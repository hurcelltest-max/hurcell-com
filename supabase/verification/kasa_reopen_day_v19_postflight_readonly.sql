-- ============================================================================
-- Verification: kasa_reopen_day_v19_postflight_readonly.sql
-- Description: HurCELL Kasa V19 Postflight Salt-Okunur Doğrulama Sorgusu
--              - fn_kasa_reopen_day fonksiyonunun varlığı ve parametreleri
--              - SECURITY DEFINER ve search_path ayarları
--              - EXECUTE izinleri (PUBLIC/anon/authenticated kapalı, service_role açık)
--              - Fonksiyon gövdesi güvenlik kuralları (yonetici rolü, gerekçe uzunluğu, kronoloji ve açık gün kontrolleri)
--              - kasa_days tablosuna eklenen denetim kolonları
--              - overall_ok doğrulama bayrağı
-- KESİN SINIR: Yalnızca SELECT ve CTE çalıştırır. Asla INSERT/UPDATE/DELETE/DDL içermez.
-- ============================================================================

WITH rpc_check AS (
    SELECT
        p.oid,
        p.proname,
        p.pronargs,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        p.prosecdef AS is_security_definer,
        p.proconfig AS search_path_config,
        has_function_privilege('public', p.oid, 'EXECUTE') AS has_execute_public,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS has_execute_anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS has_execute_authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS has_execute_service_role,
        pg_get_functiondef(p.oid) AS function_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_reopen_day'
),
column_check AS (
    SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kasa_days' AND column_name = 'reopened_at') AS has_reopened_at,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kasa_days' AND column_name = 'reopened_by_user_id') AS has_reopened_by_user_id,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kasa_days' AND column_name = 'reopen_justification') AS has_reopen_justification
),
analysis AS (
    SELECT
        (COUNT(*) = 1) AS rpc_exists,
        bool_and(identity_args = 'p_actor_user_id uuid, p_kasa_day_id uuid, p_justification text') AS args_match,
        bool_and(is_security_definer IS TRUE) AS is_security_definer,
        bool_and(has_execute_public IS FALSE) AS no_public_execute,
        bool_and(has_execute_anon IS FALSE) AS no_anon_execute,
        bool_and(has_execute_authenticated IS FALSE) AS no_auth_execute,
        bool_and(has_execute_service_role IS TRUE) AS service_role_execute,
        bool_and(function_def ILIKE '%yonetici%') AS checks_yonetici_role,
        bool_and(function_def ILIKE '%GEÇERSİZ_GEREKÇE%') AS checks_justification,
        bool_and(function_def ILIKE '%BAŞKA_GÜN_AÇIK%') AS checks_single_open_day,
        bool_and(function_def ILIKE '%GEÇMİŞ_GÜN_AÇILAMAZ%') AS checks_chronology,
        bool_and(function_def ILIKE '%gun_yeniden_acildi%') AS logs_audit
    FROM rpc_check
)
SELECT
    a.rpc_exists,
    a.args_match,
    a.is_security_definer,
    a.no_public_execute,
    a.no_anon_execute,
    a.no_auth_execute,
    a.service_role_execute,
    a.checks_yonetici_role,
    a.checks_justification,
    a.checks_single_open_day,
    a.checks_chronology,
    a.logs_audit,
    c.has_reopened_at,
    c.has_reopened_by_user_id,
    c.has_reopen_justification,
    (
        a.rpc_exists
        AND a.args_match
        AND a.is_security_definer
        AND a.no_public_execute
        AND a.no_anon_execute
        AND a.no_auth_execute
        AND a.service_role_execute
        AND a.checks_yonetici_role
        AND a.checks_justification
        AND a.checks_single_open_day
        AND a.checks_chronology
        AND a.logs_audit
        AND c.has_reopened_at
        AND c.has_reopened_by_user_id
        AND c.has_reopen_justification
    ) AS overall_ok
FROM analysis a
CROSS JOIN column_check c;
