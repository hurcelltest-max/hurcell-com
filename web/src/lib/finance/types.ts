export type FinancePlanRow = {
  id: string
  idempotency_key: string
  credit_customer_id: string
  credit_account_id: string
  source_type: string
  source_reference: string
  principal_amount: number
  down_payment_amount: number
  financed_principal: number
  term_rate_percent: number
  finance_charge_amount: number
  total_due_amount: number
  amount_paid: number
  remaining_amount: number
  installment_count: number
  statement_day: number
  first_due_date: string
  status: string
  created_by: string
  created_at: string
  updated_at: string
}

export type FinanceInstallmentRow = {
  id: string
  finance_plan_id: string
  installment_no: number
  due_date: string
  principal_amount: number
  finance_charge_amount: number
  amount_due: number
  amount_paid: number
  remaining_amount: number
  status: string
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type FinanceCollectionRow = {
  id: string
  idempotency_key: string
  finance_plan_id: string
  credit_account_id: string
  amount: number
  collection_kind: string
  payment_method: string
  receipt_number: string
  collected_at: string
  created_by: string
  note: string | null
  created_at: string
}

export type FinanceCustomerRow = {
  id: string
  full_name: string
  phone: string
  email: string | null
}

export type FinanceDashboardMetrics = {
  total_plans: number
  active_plans: number
  paid_plans: number
  overdue_plans: number
  total_financed: number
  total_collected: number
  total_outstanding: number
}

// Type guard
export function isFinancePlanRow(value: unknown): value is FinancePlanRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<FinancePlanRow>
  return (
    typeof row.id === 'string' &&
    typeof row.source_reference === 'string' &&
    typeof row.principal_amount === 'number' &&
    typeof row.total_due_amount === 'number' &&
    typeof row.status === 'string'
  )
}
