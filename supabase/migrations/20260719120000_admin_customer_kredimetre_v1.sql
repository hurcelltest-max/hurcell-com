BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- 1. Create missing indices for optimization
CREATE INDEX IF NOT EXISTS idx_finance_installments_plan_due ON public.finance_installments(finance_plan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_finance_collections_plan_collected ON public.finance_collections(finance_plan_id, collected_at);

-- 2. Create get_admin_credit_customers_with_scores RPC function
CREATE OR REPLACE FUNCTION public.get_admin_credit_customers_with_scores(
  p_status text DEFAULT NULL,
  p_risk text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Input validations
  IF p_page < 1 THEN
    RAISE EXCEPTION 'Page number must be 1 or greater';
  END IF;

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100';
  END IF;

  IF p_status IS NOT NULL AND p_status <> '' AND p_status NOT IN ('pending_review', 'active', 'rejected', 'suspended', 'blacklisted') THEN
    RAISE EXCEPTION 'Invalid status parameter: %', p_status;
  END IF;

  IF p_risk IS NOT NULL AND p_risk <> '' AND p_risk NOT IN ('regular', 'follow', 'risky', 'critical', 'no_data', 'overdue', 'has_debt') THEN
    RAISE EXCEPTION 'Invalid risk parameter: %', p_risk;
  END IF;

  IF p_search IS NOT NULL AND p_search <> '' AND length(p_search) > 100 THEN
    RAISE EXCEPTION 'Search query is too long (maximum 100 characters)';
  END IF;

  -- Execute main query
  WITH customer_metrics AS (
    SELECT
      c.id AS customer_id,
      c.card_token,
      c.customer_card_code,
      c.full_name,
      c.phone,
      c.created_at,
      c.status AS cust_status,
      a.status AS acc_status,
      a.statement_day,
      coalesce(a.credit_limit, 0) AS credit_limit,
      coalesce(a.current_balance, 0) AS current_balance,
      coalesce(a.credit_limit - a.current_balance, 0) AS available_limit,
      CASE
        WHEN coalesce(a.credit_limit, 0) > 0 THEN round((coalesce(a.current_balance, 0) / a.credit_limit) * 100, 2)
        ELSE 0
      END AS limit_utilization_percent,

      -- Plans
      coalesce(p.total_plan_count, 0) AS total_plan_count,
      coalesce(p.active_plan_count, 0) AS active_plan_count,
      coalesce(p.paid_plan_count, 0) AS paid_plan_count,
      coalesce(p.cancelled_plan_count, 0) AS cancelled_plan_count,

      -- Installments
      coalesce(inst.total_installment_count, 0) AS total_installment_count,
      coalesce(inst.due_installment_count, 0) AS due_installment_count,
      coalesce(inst.paid_installment_count, 0) AS paid_installment_count,
      coalesce(inst.on_time_paid_installment_count, 0) AS on_time_paid_installment_count,
      coalesce(inst.late_paid_installment_count, 0) AS late_paid_installment_count,
      coalesce(inst.currently_overdue_installment_count, 0) AS currently_overdue_installment_count,
      coalesce(inst.paid_due_installment_count, 0) AS paid_due_installment_count,
      coalesce(inst.on_time_paid_due_installment_count, 0) AS on_time_paid_due_installment_count,

      -- Overdue / Days late
      coalesce(inst.current_overdue_amount, 0) AS current_overdue_amount,
      coalesce(inst.maximum_days_overdue, 0) AS maximum_days_overdue,
      coalesce(inst.average_days_late, 0) AS average_days_late,

      -- Totals
      coalesce(inst.total_due_amount, 0) AS total_due_amount,
      coalesce(inst.total_paid_amount, 0) AS total_paid_amount,
      coalesce(inst.remaining_amount, 0) AS remaining_amount,

      -- Timestamps
      col.last_payment_at,
      p.first_finance_plan_at
    FROM public.credit_customers c
    LEFT JOIN public.credit_accounts a ON a.credit_customer_id = c.id
    LEFT JOIN (
      -- Plan aggregates
      SELECT
        credit_customer_id,
        count(*) AS total_plan_count,
        count(*) FILTER (WHERE status = 'active') AS active_plan_count,
        count(*) FILTER (WHERE status = 'paid') AS paid_plan_count,
        count(*) FILTER (WHERE status = 'cancelled') AS cancelled_plan_count,
        min(created_at) AS first_finance_plan_at
      FROM public.finance_plans
      GROUP BY credit_customer_id
    ) p ON p.credit_customer_id = c.id
    LEFT JOIN (
      -- Installment aggregates (excluding cancelled for risk calculations)
      SELECT
        fp.credit_customer_id,
        count(*) AS total_installment_count, -- Includes cancelled installments
        count(*) FILTER (WHERE fi.due_date <= current_date AND fi.status <> 'cancelled') AS due_installment_count,
        count(*) FILTER (WHERE fi.status = 'paid') AS paid_installment_count,
        count(*) FILTER (WHERE fi.status = 'paid' AND fi.paid_at::date <= fi.due_date) AS on_time_paid_installment_count,
        count(*) FILTER (WHERE fi.status = 'paid' AND fi.paid_at::date > fi.due_date) AS late_paid_installment_count,
        count(*) FILTER (WHERE fi.due_date < current_date AND fi.remaining_amount > 0 AND fi.status <> 'cancelled') AS currently_overdue_installment_count,
        count(*) FILTER (WHERE fi.due_date <= current_date AND fi.status = 'paid') AS paid_due_installment_count,
        count(*) FILTER (WHERE fi.due_date <= current_date AND fi.status = 'paid' AND fi.paid_at::date <= fi.due_date) AS on_time_paid_due_installment_count,
        coalesce(sum(fi.remaining_amount) FILTER (WHERE fi.due_date < current_date AND fi.remaining_amount > 0 AND fi.status <> 'cancelled'), 0) AS current_overdue_amount,
        coalesce(max(current_date - fi.due_date) FILTER (WHERE fi.due_date < current_date AND fi.remaining_amount > 0 AND fi.status <> 'cancelled'), 0) AS maximum_days_overdue,
        coalesce(avg(fi.paid_at::date - fi.due_date) FILTER (WHERE fi.status = 'paid' AND fi.paid_at::date > fi.due_date), 0) AS average_days_late,
        coalesce(sum(fi.amount_due) FILTER (WHERE fi.status <> 'cancelled'), 0) AS total_due_amount,
        coalesce(sum(fi.amount_paid) FILTER (WHERE fi.status <> 'cancelled'), 0) AS total_paid_amount,
        coalesce(sum(fi.remaining_amount) FILTER (WHERE fi.status <> 'cancelled'), 0) AS remaining_amount
      FROM public.finance_installments fi
      JOIN public.finance_plans fp ON fp.id = fi.finance_plan_id
      GROUP BY fp.credit_customer_id
    ) inst ON inst.credit_customer_id = c.id
    LEFT JOIN (
      -- Collection last payment timestamp
      SELECT
        credit_account_id,
        max(collected_at) AS last_payment_at
      FROM public.finance_collections
      WHERE direction = 'in'
      GROUP BY credit_account_id
    ) col ON col.credit_account_id = a.id
  ),
  customer_scores AS (
    SELECT
      m.*,
      CASE
        -- No data if no due installments OR if nothing is paid yet AND no overdue exists
        WHEN m.due_installment_count = 0 OR (m.paid_installment_count = 0 AND m.currently_overdue_installment_count = 0) THEN NULL
        ELSE
          -- Calculate raw score
          LEAST(GREATEST(
            ROUND(
              -- 1. Zamanında ödeme puanı (max 40)
              (CASE WHEN m.paid_installment_count = 0 THEN 0 ELSE (m.on_time_paid_installment_count::numeric / m.paid_installment_count) * 40 END)
              -- 2. Açık gecikme puanı (max 25)
              + (CASE
                  WHEN m.currently_overdue_installment_count = 0 THEN 25
                  WHEN m.maximum_days_overdue <= 7 THEN 18
                  WHEN m.maximum_days_overdue <= 14 THEN 12
                  WHEN m.maximum_days_overdue <= 29 THEN 5
                  ELSE 0
                 END)
              -- 3. Ödenen borç oranı (max 15)
              + (CASE WHEN m.total_due_amount = 0 THEN 0 ELSE LEAST(m.total_paid_amount::numeric / m.total_due_amount, 1) * 15 END)
              -- 4. Limit kullanım puanı (max 10)
              + (CASE
                  WHEN m.limit_utilization_percent <= 70 THEN 10
                  WHEN m.limit_utilization_percent <= 90 THEN 5
                  ELSE 0
                 END)
              -- 5. Geçmiş ve istikrar (max 10)
              + (CASE
                  WHEN m.paid_plan_count >= 2 THEN 10
                  WHEN m.paid_plan_count = 1 THEN 5
                  ELSE 0
                 END)
            ),
            0
          ), 100)
      END AS raw_score
    FROM customer_metrics m
  ),
  customer_scores_capped AS (
    SELECT
      s.*,
      CASE
        WHEN s.raw_score IS NULL THEN NULL
        ELSE
          CASE
            -- Open overdue AND no payments made -> max 39
            WHEN s.currently_overdue_installment_count > 0 AND s.total_paid_amount = 0 THEN LEAST(s.raw_score, 39)
            -- maximum_days_overdue >= 30 -> max 39
            WHEN s.maximum_days_overdue >= 30 THEN LEAST(s.raw_score, 39)
            -- Open overdue -> max 79
            WHEN s.currently_overdue_installment_count > 0 THEN LEAST(s.raw_score, 79)
            -- 3+ due installments, all paid on time, no overdue -> min 80
            WHEN s.due_installment_count >= 3
                 AND s.currently_overdue_installment_count = 0
                 AND s.paid_due_installment_count = s.due_installment_count
                 AND s.on_time_paid_due_installment_count = s.due_installment_count THEN GREATEST(s.raw_score, 80)
            ELSE s.raw_score
          END
      END AS credit_score
    FROM customer_scores s
  ),
  customer_final AS (
    SELECT
      c.*,
      CASE
        WHEN c.credit_score IS NULL THEN 'Veri Yok'
        WHEN c.currently_overdue_installment_count > 0 AND c.total_paid_amount = 0 THEN 'Kritik'
        WHEN c.credit_score >= 80 THEN 'Düzenli'
        WHEN c.credit_score >= 60 THEN 'Takip'
        WHEN c.credit_score >= 40 THEN 'Riskli'
        ELSE 'Kritik'
      END AS credit_label,
      CASE
        WHEN c.credit_score IS NULL THEN 'gray'
        WHEN c.currently_overdue_installment_count > 0 AND c.total_paid_amount = 0 THEN 'red'
        WHEN c.credit_score >= 80 THEN 'green'
        WHEN c.credit_score >= 60 THEN 'yellow'
        WHEN c.credit_score >= 40 THEN 'orange'
        ELSE 'red'
      END AS credit_color
    FROM customer_scores_capped c
  ),
  customer_searched AS (
    SELECT *
    FROM customer_final
    WHERE
      (p_search IS NULL OR p_search = ''
       OR full_name ILIKE '%' || p_search || '%'
       OR phone ILIKE '%' || p_search || '%'
       OR customer_card_code ILIKE '%' || p_search || '%')
  ),
  global_counts AS (
    -- Computed globally over customer_final (independent of search, status, or risk filters)
    SELECT
      count(*) AS count_all,
      count(*) FILTER (WHERE cust_status = 'pending_review') AS count_pending,
      count(*) FILTER (WHERE cust_status = 'active') AS count_active,
      count(*) FILTER (WHERE currently_overdue_installment_count > 0) AS count_overdue,
      count(*) FILTER (WHERE credit_score <= 39 OR credit_label = 'Kritik') AS count_critical,
      count(*) FILTER (WHERE credit_score IS NULL) AS count_nodata
    FROM customer_final
  ),
  filtered_data AS (
    SELECT *
    FROM customer_searched
    WHERE
      (p_status IS NULL OR p_status = '' OR cust_status = p_status)
      AND (
        p_risk IS NULL OR p_risk = ''
        OR (p_risk = 'regular' AND credit_score >= 80)
        OR (p_risk = 'follow' AND credit_score >= 60 AND credit_score <= 79)
        OR (p_risk = 'risky' AND credit_score >= 40 AND credit_score <= 59)
        OR (p_risk = 'critical' AND credit_score <= 39 AND credit_score IS NOT NULL)
        OR (p_risk = 'no_data' AND credit_score IS NULL)
        OR (p_risk = 'overdue' AND currently_overdue_installment_count > 0)
        OR (p_risk = 'has_debt' AND current_balance > 0)
      )
  ),
  total_count AS (
    SELECT count(*) AS total FROM filtered_data
  ),
  paginated_data AS (
    SELECT *
    FROM filtered_data
    ORDER BY created_at DESC, customer_id DESC
    LIMIT p_limit
    OFFSET (p_page - 1) * p_limit
  )

  SELECT jsonb_build_object(
    'data', (
      SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.customer_id DESC), '[]'::jsonb)
      FROM paginated_data r
    ),
    'pagination', jsonb_build_object(
      'page', p_page,
      'limit', p_limit,
      'total', (SELECT total FROM total_count),
      'totalPages', CEIL((SELECT total FROM total_count)::numeric / p_limit)::integer
    ),
    'counts', jsonb_build_object(
      'all', (SELECT count_all FROM global_counts),
      'pendingReview', (SELECT count_pending FROM global_counts),
      'active', (SELECT count_active FROM global_counts),
      'overdue', (SELECT count_overdue FROM global_counts),
      'critical', (SELECT count_critical FROM global_counts),
      'noData', (SELECT count_nodata FROM global_counts)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 3. Manage permissions and access controls
REVOKE ALL ON FUNCTION public.get_admin_credit_customers_with_scores(
  text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_credit_customers_with_scores(
  text, text, text, integer, integer
) TO service_role;

COMMIT;
