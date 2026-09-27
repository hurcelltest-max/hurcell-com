-- ============================================================================
-- HURCELL KASA V25 PREFLIGHT READONLY VERIFICATION
-- ============================================================================
-- Verifies the current permissions and states for Koray, Bahar, and Hür
-- BEFORE applying the V25 permission hardening migration.
-- ============================================================================

WITH target_users AS (
    SELECT id, username, full_name, role, is_active, created_at
    FROM public.kasa_users
    WHERE username IN ('hur', 'bahar', 'koray')
),
user_perms AS (
    SELECT 
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'permission_key', p.permission_key,
                    'is_allowed', p.is_allowed,
                    'revoked_at', p.revoked_at
                ) ORDER BY p.permission_key
            ) FILTER (WHERE p.permission_key IS NOT NULL),
            '[]'::jsonb
        ) AS active_permissions
    FROM target_users u
    LEFT JOIN public.kasa_user_permissions p 
        ON u.id = p.user_id AND p.is_allowed IS TRUE AND p.revoked_at IS NULL
    GROUP BY u.id, u.username, u.full_name, u.role, u.is_active
)
SELECT jsonb_pretty(jsonb_agg(to_jsonb(up))) AS preflight_user_permissions
FROM user_perms up;
