-- ============================================================================
-- POSTFLIGHT READ-ONLY: KASA KORAY USER CREATION & PERMISSION VERIFICATION
-- Target Database: Production Supabase (ufazfmosiywlskjlzach)
-- ============================================================================

SELECT jsonb_build_object(
    'koray_user', (
        SELECT jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'full_name', u.full_name,
            'role', u.role,
            'is_active', u.is_active,
            'has_password_hash', (u.password_hash IS NOT NULL AND length(u.password_hash) > 20),
            'permissions', (
                SELECT jsonb_agg(
                    jsonb_build_object('permission_key', p.permission_key, 'is_allowed', p.is_allowed)
                    ORDER BY p.permission_key
                )
                FROM public.kasa_user_permissions p
                WHERE p.user_id = u.id AND p.revoked_at IS NULL
            )
        )
        FROM public.kasa_users u
        WHERE u.username = 'koray'
    ),
    'bahar_user', (
        SELECT jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'role', u.role,
            'is_active', u.is_active,
            'permissions', (
                SELECT jsonb_agg(p.permission_key ORDER BY p.permission_key)
                FROM public.kasa_user_permissions p
                WHERE p.user_id = u.id AND p.is_allowed IS TRUE AND p.revoked_at IS NULL
            )
        )
        FROM public.kasa_users u
        WHERE u.username = 'bahar'
    ),
    'admin_user', (
        SELECT jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'role', u.role,
            'is_active', u.is_active
        )
        FROM public.kasa_users u
        WHERE u.username = 'hur'
    ),
    'audit_logs', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'action', a.action,
                'entity_type', a.entity_type,
                'entity_id', a.entity_id,
                'user_id', a.user_id,
                'justification', a.justification,
                'created_at', a.created_at
            )
            ORDER BY a.created_at DESC
        )
        FROM public.kasa_audit_logs a
        WHERE a.entity_type IN ('kasa_users', 'kasa_user_permissions')
          AND a.created_at >= now() - interval '1 hour'
    ),
    'total_users', (SELECT count(*) FROM public.kasa_users),
    'overall_ok', (
        SELECT EXISTS (
            SELECT 1 
            FROM public.kasa_users u
            JOIN public.kasa_user_permissions p ON p.user_id = u.id
            WHERE u.username = 'koray'
              AND u.full_name = 'Koray SARISALTIK'
              AND u.role = 'personel'
              AND u.is_active IS TRUE
              AND p.permission_key = 'kasa.expense.view_all'
              AND p.is_allowed IS TRUE
              AND p.revoked_at IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 
            FROM public.kasa_user_permissions p
            JOIN public.kasa_users u ON p.user_id = u.id
            WHERE u.username = 'koray'
              AND p.permission_key IN ('kasa.sale.cancel', 'kasa.expense.bank', 'kasa.expense.salary.create', 'kasa.bank.balance.record')
              AND p.is_allowed IS TRUE
              AND p.revoked_at IS NULL
        )
    )
) AS postflight_result;
