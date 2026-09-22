-- ============================================================================
-- HurCELL Kasa V21 - Gece Yarısı Tarih Değişimi & Açık Gün Preflight Read-Only
-- Amaç:
-- 1. Canlıdaki açık günleri ve son kasa gününü listele.
-- 2. Mevcut fn_kasa_assert_active_day_for_mutation ve fn_kasa_get_or_create_open_day fonksiyonlarını incele.
-- 3. Bahar'ın kasa.expense.bank ve kasa.sale.cancel izinlerini doğrula.
-- 4. Aktif banka hesaplarını kontrol et.
-- ============================================================================

WITH open_days_info AS (
    SELECT
        count(*) AS open_day_count,
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'date_val', date_val,
            'status', status,
            'opening_balance_kurus', opening_balance_kurus,
            'expected_cash_kurus', expected_cash_kurus,
            'counted_cash_kurus', counted_cash_kurus
        )), '[]'::jsonb) AS open_days
    FROM public.kasa_days
    WHERE status = 'open'
),
latest_day_info AS (
    SELECT
        id,
        date_val,
        status,
        opening_balance_kurus,
        expected_cash_kurus,
        counted_cash_kurus,
        closed_at,
        reopened_at
    FROM public.kasa_days
    ORDER BY date_val DESC
    LIMIT 3
),
func_info AS (
    SELECT
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS args,
        p.prosecdef,
        pg_get_functiondef(p.oid) AS funcdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_kasa_assert_active_day_for_mutation', 'fn_kasa_get_or_create_open_day')
),
bahar_info AS (
    SELECT
        u.id,
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
)
SELECT jsonb_pretty(jsonb_build_object(
    'timestamp_utc', now(),
    'istanbul_today', (now() AT TIME ZONE 'Europe/Istanbul')::date,
    'open_day_count', (SELECT open_day_count FROM open_days_info),
    'open_days', (SELECT open_days FROM open_days_info),
    'latest_3_days', (SELECT jsonb_agg(to_jsonb(l)) FROM latest_day_info l),
    'functions', (SELECT jsonb_agg(jsonb_build_object(
        'proname', f.proname,
        'args', f.args,
        'is_security_definer', f.prosecdef,
        'has_date_mismatch_check', (f.funcdef LIKE '%KASA_GUNU_TARIH_UYUSMAZLIGI%'),
        'has_previous_unclosed_check', (f.funcdef LIKE '%PREVIOUS_DAY_UNCLOSED%')
    )) FROM func_info f),
    'bahar', (SELECT to_jsonb(b) FROM bahar_info b)
));
