-- ============================================================================
-- HurCELL Kasa V22 - Bahar AYDAMGA Tüm Kasa Giderlerini Görüntüleme Yetkisi
-- Postflight Read-Only Doğrulama Raporu (kasa.expense.view_all)
-- ============================================================================

WITH target_user AS (
    SELECT
        id, username, full_name, role, is_active
    FROM public.kasa_users
    WHERE id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
),
target_perms AS (
    SELECT
        permission_key, is_allowed, granted_at, revoked_at
    FROM public.kasa_user_permissions
    WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
),
other_personnel_with_view_all AS (
    SELECT
        u.id, u.username, u.full_name
    FROM public.kasa_users u
    JOIN public.kasa_user_permissions p ON p.user_id = u.id
    WHERE u.id <> '38eca216-7235-414b-8cc3-349087a166da'::uuid
      AND u.role = 'personel'
      AND p.permission_key = 'kasa.expense.view_all'
      AND p.is_allowed IS TRUE
      AND p.revoked_at IS NULL
),
audit_entry AS (
    SELECT
        id, action, entity_type, entity_id, details, justification, created_at
    FROM public.kasa_audit_logs
    WHERE entity_type = 'kasa_user_permissions'
      AND entity_id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
      AND action = 'user_permission_granted'
      AND details->>'permission_key' = 'kasa.expense.view_all'
    ORDER BY created_at DESC
    LIMIT 1
)
SELECT jsonb_pretty(jsonb_build_object(
    'postflight_timestamp', now(),
    'bahar_status', (
        SELECT jsonb_build_object(
            'found', (COUNT(*) > 0),
            'username', MAX(username),
            'full_name', MAX(full_name),
            'role_is_personel', (MAX(role) = 'personel'),
            'is_active', bool_and(is_active)
        )
        FROM target_user
    ),
    'bahar_permissions', (
        SELECT jsonb_build_object(
            'has_expense_view_all', EXISTS (
                SELECT 1 FROM target_perms WHERE permission_key = 'kasa.expense.view_all' AND is_allowed IS TRUE AND revoked_at IS NULL
            ),
            'has_bank_expense', EXISTS (
                SELECT 1 FROM target_perms WHERE permission_key = 'kasa.expense.bank' AND is_allowed IS TRUE AND revoked_at IS NULL
            ),
            'has_sale_cancel', EXISTS (
                SELECT 1 FROM target_perms WHERE permission_key = 'kasa.sale.cancel' AND is_allowed IS TRUE AND revoked_at IS NULL
            ),
            'all_permissions', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'permission_key', permission_key,
                        'is_allowed', is_allowed,
                        'granted_at', granted_at
                    )
                ), '[]'::jsonb)
                FROM target_perms
            )
        )
    ),
    'isolation_check', (
        SELECT jsonb_build_object(
            'other_personnel_with_view_all_count', COUNT(*),
            'leaked_users', COALESCE(jsonb_agg(username), '[]'::jsonb)
        )
        FROM other_personnel_with_view_all
    ),
    'audit_log_verified', EXISTS (SELECT 1 FROM audit_entry),
    'overall_ok', (
        EXISTS (SELECT 1 FROM target_user WHERE role = 'personel' AND is_active IS TRUE)
        AND EXISTS (SELECT 1 FROM target_perms WHERE permission_key = 'kasa.expense.view_all' AND is_allowed IS TRUE AND revoked_at IS NULL)
        AND EXISTS (SELECT 1 FROM target_perms WHERE permission_key = 'kasa.expense.bank' AND is_allowed IS TRUE AND revoked_at IS NULL)
        AND EXISTS (SELECT 1 FROM target_perms WHERE permission_key = 'kasa.sale.cancel' AND is_allowed IS TRUE AND revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM other_personnel_with_view_all)
        AND EXISTS (SELECT 1 FROM audit_entry)
    )
)) AS postflight_diagnostic_report;
