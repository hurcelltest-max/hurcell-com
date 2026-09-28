-- ============================================================================
-- POSTFLIGHT READ-ONLY: KASA CARRYOVER REPAIR 26-28 SEPTEMBER (V26)
-- ============================================================================
SELECT json_build_object(
  'postflight_timestamp', now(),
  'source_day_26', (
    SELECT json_build_object(
      'id', kd.id,
      'date_val', kd.date_val,
      'status', kd.status,
      'expected_cash_kurus', kd.expected_cash_kurus,
      'counted_cash_kurus', kd.counted_cash_kurus,
      'cash_difference_kurus', kd.cash_difference_kurus,
      'closing_note', kd.closing_note,
      'is_count_correct', (kd.counted_cash_kurus = 674000 AND kd.cash_difference_kurus = 0)
    )
    FROM kasa_days kd
    WHERE kd.date_val = '2026-09-26'
  ),
  'target_day_28', (
    SELECT json_build_object(
      'id', kd.id,
      'date_val', kd.date_val,
      'status', kd.status,
      'opening_balance_kurus', kd.opening_balance_kurus,
      'is_opening_repaired', kd.is_opening_repaired,
      'repair_note', kd.repair_note,
      'is_opening_correct', (kd.opening_balance_kurus = 674000 AND kd.is_opening_repaired = true)
    )
    FROM kasa_days kd
    WHERE kd.date_val = '2026-09-28'
  ),
  'movements_26', (
    SELECT json_agg(json_build_object(
      'id', km.id,
      'movement_type', km.movement_type,
      'amount_kurus', km.amount_kurus,
      'description', km.description,
      'justification', km.justification
    ) ORDER BY km.created_at ASC)
    FROM kasa_movements km
    JOIN kasa_days kd ON km.kasa_day_id = kd.id
    WHERE kd.date_val = '2026-09-26'
  ),
  'movements_28', (
    SELECT json_agg(json_build_object(
      'id', km.id,
      'movement_type', km.movement_type,
      'amount_kurus', km.amount_kurus,
      'description', km.description,
      'justification', km.justification
    ) ORDER BY km.created_at ASC)
    FROM kasa_movements km
    JOIN kasa_days kd ON km.kasa_day_id = kd.id
    WHERE kd.date_val = '2026-09-28'
  ),
  'audit_logs_v26', (
    SELECT json_agg(json_build_object(
      'id', kal.id,
      'action', kal.action,
      'entity_type', kal.entity_type,
      'entity_id', kal.entity_id,
      'actor', ku.username,
      'details', kal.details,
      'justification', kal.justification,
      'created_at', kal.created_at
    ) ORDER BY kal.created_at DESC)
    FROM kasa_audit_logs kal
    LEFT JOIN kasa_users ku ON kal.user_id = ku.id
    WHERE kal.action IN ('kapanis_sayimi_duzeltildi', 'devir_onarildi')
  ),
  'rpc_installed', (
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_correct_day_closing_count'
    )
  ),
  'overall_status_ok', (
    SELECT (
      COUNT(*) FILTER (WHERE date_val = '2026-09-26' AND counted_cash_kurus = 674000 AND cash_difference_kurus = 0) = 1 AND
      COUNT(*) FILTER (WHERE date_val = '2026-09-28' AND opening_balance_kurus = 674000 AND is_opening_repaired = true) = 1
    )
    FROM kasa_days
    WHERE date_val IN ('2026-09-26', '2026-09-28')
  )
) as postflight_report;
