/**
 * Builds a deterministic idempotency key for finance plan creation.
 *
 * @param customerId The unique identifier of the customer.
 * @param sourceType The type of the transaction source.
 * @param sourceReference The source transaction reference code.
 * @returns A stable, colon-separated idempotency key.
 */
export function buildFinancePlanIdempotencyKey(
  customerId: string,
  sourceType: string,
  sourceReference: string
): string {
  if (typeof customerId !== 'string' || typeof sourceType !== 'string' || typeof sourceReference !== 'string') {
    throw new Error('Tüm argümanlar metin (string) türünde olmalıdır.');
  }

  const cleanCustomerId = customerId.trim();
  const cleanSourceType = sourceType.trim();
  const cleanSourceReference = sourceReference.trim();

  if (!cleanCustomerId || !cleanSourceType || !cleanSourceReference) {
    throw new Error('Idempotency anahtarı bileşenleri boş olamaz.');
  }

  return [
    'finance-plan-v1',
    cleanCustomerId,
    cleanSourceType,
    cleanSourceReference
  ].join(':');
}
