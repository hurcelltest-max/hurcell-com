-- ============================================================================
-- PREFLIGHT READ-ONLY: KORAY PERMISSIONS & REPORTS (V27)
-- ============================================================================
SELECT json_build_object(
  'preflight_timestamp', now(),
  'koray_user', (
    SELECT json_build_object(
      'id', u.id,
      'username', u.username,
      'full_name', u.full_name,
      'role', u.role,
      'is_active', u.is_active,
      'permissions', (
        SELECT COALESCE(json_agg(json_build_object(
          'permission_key', p.permission_key,
          'is_allowed', p.is_allowed
        ) ORDER BY p.permission_key ASC), '[]'::json)
        FROM kasa_user_permissions p
        WHERE p.user_id = u.id AND p.is_allowed = true AND p.revoked_at IS NULL
      )
    )
    FROM kasa_users u
    WHERE u.username = 'koray'
  ),
  'admin_user', (
    SELECT json_build_object(
      'id', id,
      'username', username,
      'role', role,
      'is_active', is_active
    )
    FROM kasa_users
    WHERE username = 'hur'
  )
) as preflight_report;
