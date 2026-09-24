-- ============================================================================
-- HurCELL Kasa V22 - Bahar AYDAMGA Tüm Kasa Giderlerini Görüntüleme Yetkisi
-- Preflight Read-Only Doğrulama Raporu (kasa.expense.view_all)
-- Hedef: Bahar AYDAMGA (38eca216-7235-414b-8cc3-349087a166da / username: bahar)
--
-- KESİN GÜVENLİK KURALLARI:
--  1. Yalnız SELECT ve CTE; kesinlikle INSERT / UPDATE / DELETE / DDL İÇERMEZ.
--  2. Production verisini değiştirmez, test kaydı oluşturmaz.
--  3. Parola hash'i, secret, token veya private key bilgisi ASLA gösterilmez.
-- ============================================================================

WITH target_user_info AS (
    SELECT
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at
    FROM public.kasa_users u
    WHERE u.id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
       OR u.username = 'bahar'
    LIMIT 1
),
target_user_perms AS (
    SELECT
        p.permission_key,
        p.is_allowed,
        p.granted_at,
        p.revoked_at
    FROM public.kasa_user_permissions p
    WHERE p.user_id = (SELECT id FROM target_user_info)
    ORDER BY p.permission_key ASC
),
active_manager_info AS (
    SELECT
        u.id,
        u.username,
        u.full_name,
        u.role
    FROM public.kasa_users u
    WHERE u.role = 'yonetici' AND u.is_active IS TRUE
    ORDER BY u.created_at ASC
    LIMIT 1
),
expense_categories_info AS (
    SELECT
        c.id,
        c.name,
        c.is_salary_category,
        c.is_active,
        c.display_order
    FROM public.kasa_expense_categories c
    ORDER BY c.display_order ASC
),
recent_expenses_info AS (
    SELECT
        e.id,
        e.kasa_day_id,
        d.date_val AS day_date,
        d.status AS day_status,
        e.expense_category_id,
        c.name AS category_name,
        c.is_salary_category,
        e.amount_kurus,
        e.description,
        e.recipient_name,
        e.payment_method,
        e.status,
        e.created_by_user_id,
        u.full_name AS created_by_name,
        e.created_at
    FROM public.kasa_expenses e
    JOIN public.kasa_days d ON d.id = e.kasa_day_id
    JOIN public.kasa_expense_categories c ON c.id = e.expense_category_id
    JOIN public.kasa_users u ON u.id = e.created_by_user_id
    ORDER BY e.created_at DESC
    LIMIT 20
)
SELECT jsonb_pretty(jsonb_build_object(
    'preflight_timestamp', now(),
    'target_user', (
        SELECT jsonb_build_object(
            'found', (COUNT(*) > 0),
            'id', MAX(u.id::text),
            'username', MAX(u.username),
            'full_name', MAX(u.full_name),
            'role', MAX(u.role),
            'is_active', bool_and(u.is_active),
            'all_permissions', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'permission_key', p.permission_key,
                        'is_allowed', p.is_allowed,
                        'granted_at', p.granted_at,
                        'revoked_at', p.revoked_at
                    )
                ), '[]'::jsonb)
                FROM target_user_perms p
            ),
            'has_bank_expense_permission', EXISTS (
                SELECT 1 FROM target_user_perms WHERE permission_key = 'kasa.expense.bank' AND is_allowed IS TRUE AND revoked_at IS NULL
            ),
            'has_sale_cancel_permission', EXISTS (
                SELECT 1 FROM target_user_perms WHERE permission_key = 'kasa.sale.cancel' AND is_allowed IS TRUE AND revoked_at IS NULL
            ),
            'has_expense_view_all_permission', EXISTS (
                SELECT 1 FROM target_user_perms WHERE permission_key = 'kasa.expense.view_all' AND is_allowed IS TRUE AND revoked_at IS NULL
            )
        )
        FROM target_user_info u
    ),
    'active_manager', (
        SELECT jsonb_build_object(
            'found', (COUNT(*) > 0),
            'id', MAX(m.id::text),
            'username', MAX(m.username),
            'full_name', MAX(m.full_name)
        )
        FROM active_manager_info m
    ),
    'expense_categories', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ec.id,
                'name', ec.name,
                'is_salary_category', ec.is_salary_category,
                'is_active', ec.is_active,
                'display_order', ec.display_order
            )
        )
        FROM expense_categories_info ec
    ),
    'recent_expenses_sample', (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', re.id,
                'day_date', re.day_date,
                'day_status', re.day_status,
                'category_name', re.category_name,
                'is_salary_category', re.is_salary_category,
                'amount_kurus', re.amount_kurus,
                'amount_tl', (re.amount_kurus / 100.0),
                'description', re.description,
                'recipient_name', re.recipient_name,
                'payment_method', re.payment_method,
                'status', re.status,
                'created_by_name', re.created_by_name,
                'created_at', re.created_at
            )
        ), '[]'::jsonb)
        FROM recent_expenses_info re
    )
)) AS preflight_diagnostic_report;
