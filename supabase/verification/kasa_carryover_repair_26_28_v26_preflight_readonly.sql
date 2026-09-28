-- ============================================================================
-- PREFLIGHT READ-ONLY: KASA CARRYOVER REPAIR 26-28 SEPTEMBER (V26)
-- ============================================================================
SELECT json_build_object(
  'preflight_timestamp', now(),
  'target_day_28', (
    SELECT json_build_object(
      'id', kd.id,
      'date_val', kd.date_val,
      'status', kd.status,
      'opening_balance_kurus', kd.opening_balance_kurus,
      'is_opening_repaired', kd.is_opening_repaired,
      'repair_note', kd.repair_note
    )
    FROM kasa_days kd
    WHERE kd.date_val = '2026-09-28'
  ),
  'source_day_26', (
    SELECT json_build_object(
      'id', kd.id,
      'date_val', kd.date_val,
      'status', kd.status,
      'expected_cash_kurus', kd.expected_cash_kurus,
      'counted_cash_kurus', kd.counted_cash_kurus,
      'cash_difference_kurus', kd.cash_difference_kurus,
      'closing_note', kd.closing_note,
      'closed_by', u.username
    )
    FROM kasa_days kd
    LEFT JOIN kasa_users u ON kd.closed_by_user_id = u.id
    WHERE kd.date_val = '2026-09-26'
  ),
  'hur_user', (
    SELECT json_build_object(
      'id', id,
      'username', username,
      'role', role,
      'is_active', is_active
    )
    FROM kasa_users
    WHERE username = 'hur'
  ),
  'ready_for_repair', (
    SELECT (
      COUNT(*) FILTER (WHERE date_val = '2026-09-26' AND status = 'closed') = 1 AND
      COUNT(*) FILTER (WHERE date_val = '2026-09-28' AND status = 'open') = 1
    )
    FROM kasa_days
    WHERE date_val IN ('2026-09-26', '2026-09-28')
  )
) as preflight_report;
