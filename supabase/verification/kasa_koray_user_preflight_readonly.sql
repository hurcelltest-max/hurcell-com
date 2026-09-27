-- ============================================================================
-- PREFLIGHT READ-ONLY: KASA KORAY USER CREATION
-- Target Database: Production Supabase (ufazfmosiywlskjlzach)
-- ============================================================================

SELECT jsonb_build_object(
    'existing_user_by_username', (
        SELECT to_jsonb(u) 
        FROM public.kasa_users u 
        WHERE u.username = 'koray'
    ),
    'existing_user_by_name', (
        SELECT to_jsonb(u) 
        FROM public.kasa_users u 
        WHERE u.full_name ILIKE '%Koray%'
    ),
    'admin_user', (
        SELECT jsonb_build_object('id', id, 'username', username, 'role', role, 'is_active', is_active)
        FROM public.kasa_users
        WHERE role = 'yonetici' AND is_active IS TRUE
        ORDER BY created_at ASC
        LIMIT 1
    ),
    'bahar_user', (
        SELECT jsonb_build_object(
            'id', id, 
            'username', username, 
            'role', role, 
            'is_active', is_active,
            'permissions', (
                SELECT jsonb_agg(permission_key ORDER BY permission_key)
                FROM public.kasa_user_permissions
                WHERE user_id = u.id AND is_allowed IS TRUE AND revoked_at IS NULL
            )
        )
        FROM public.kasa_users u
        WHERE username = 'bahar'
    ),
    'total_users', (SELECT count(*) FROM public.kasa_users)
) AS preflight_result;
