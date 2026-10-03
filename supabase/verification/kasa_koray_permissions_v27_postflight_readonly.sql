-- ============================================================================
-- POSTFLIGHT READ-ONLY: KORAY PERMISSIONS & REPORTS (V27)
-- ============================================================================
SELECT json_build_object(
  'postflight_timestamp', now(),
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
  'permission_checks', (
    SELECT json_build_object(
      'has_expense_view_all', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.view_all' AND is_allowed = true AND revoked_at IS NULL),
      'has_expense_create', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.create' AND is_allowed = true AND revoked_at IS NULL),
      'has_expense_bank', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.bank' AND is_allowed = true AND revoked_at IS NULL),
      'has_expense_salary_create', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.salary.create' AND is_allowed = true AND revoked_at IS NULL),
      'has_expense_update', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.update' AND is_allowed = true AND revoked_at IS NULL),
      'has_expense_cancel', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.expense.cancel' AND is_allowed = true AND revoked_at IS NULL),
      'has_sale_update', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.sale.update' AND is_allowed = true AND revoked_at IS NULL),
      'has_sale_cancel', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.sale.cancel' AND is_allowed = true AND revoked_at IS NULL),
      'has_bank_balance_record', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.bank.balance.record' AND is_allowed = true AND revoked_at IS NULL),
      'has_reports_view', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.reports.view' AND is_allowed = true AND revoked_at IS NULL),
      'has_balance_sheet_view', EXISTS (SELECT 1 FROM kasa_user_permissions WHERE user_id = u.id AND permission_key = 'kasa.balance_sheet.view' AND is_allowed = true AND revoked_at IS NULL)
    )
    FROM kasa_users u
    WHERE u.username = 'koray'
  ),
  'audit_log_verified', EXISTS (
    SELECT 1 FROM kasa_audit_logs
    WHERE entity_type = 'kasa_user_permissions'
      AND entity_id = '188f9002-1b23-475e-861d-78c4de0008e3'
      AND action = 'user_permission_granted'
      AND created_at >= (now() - interval '5 minutes')
  ),
  'rpcs_installed', (
    SELECT (
      COUNT(*) FILTER (WHERE proname = 'fn_kasa_update_expense') = 1 AND
      COUNT(*) FILTER (WHERE proname = 'fn_kasa_cancel_expense') = 1
    )
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN ('fn_kasa_update_expense', 'fn_kasa_cancel_expense')
  )
) as postflight_report;
