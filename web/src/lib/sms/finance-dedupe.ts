export type FinanceSmsEvent =
  | 'finance_plan_created'
  | 'finance_payment_received'
  | 'finance_balance_remaining'
  | 'finance_installment_due_soon'
  | 'finance_installment_overdue';

export function buildFinanceSmsDedupeKey(
  planId: string,
  event: FinanceSmsEvent,
  eventInstanceKey: string
): string {
  if (typeof planId !== 'string' || typeof event !== 'string' || typeof eventInstanceKey !== 'string') {
    throw new Error('All parameters must be strings');
  }

  const trimmedPlanId = planId.trim();
  const trimmedEvent = event.trim();
  const trimmedEventInstanceKey = eventInstanceKey.trim();

  if (!trimmedPlanId) {
    throw new Error('planId cannot be empty');
  }
  if (!trimmedEvent) {
    throw new Error('event cannot be empty');
  }
  if (!trimmedEventInstanceKey) {
    throw new Error('eventInstanceKey cannot be empty');
  }

  const key = `finance:${trimmedPlanId}:${trimmedEvent}:${trimmedEventInstanceKey}`;

  if (key.length > 255) {
    throw new Error(`Idempotency key exceeds 255 characters limit: ${key.length} characters`);
  }

  return key;
}
