export const FINANCE_TARIFF_VERSION = '2026-07-v1';
export const FINANCE_MONTHLY_RATE_PERCENT = 3.25;
export const FINANCE_MIN_INSTALLMENTS = 1;
export const FINANCE_MAX_INSTALLMENTS = 3;

export function getFinanceTermRatePercent(
  installmentCount: number
): number {
  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < FINANCE_MIN_INSTALLMENTS ||
    installmentCount > FINANCE_MAX_INSTALLMENTS
  ) {
    throw new Error(
      'Geçersiz taksit sayısı. Sadece 1, 2 veya 3 taksit desteklenmektedir.'
    );
  }

  if (installmentCount === 1) {
    return 0;
  }

  const monthlyRate =
    FINANCE_MONTHLY_RATE_PERCENT / 100;

  const termRate =
    (Math.pow(1 + monthlyRate, installmentCount) - 1) * 100;

  return Math.round(termRate * 10000) / 10000;
}

export interface FinanceCalculationResult {
  financedPrincipal: number;
  monthlyRatePercent: number;
  termRatePercent: number;
  chargeAmount: number;
  totalDueAmount: number;
  installments: Array<{ installmentNo: number; amount: number }>;
}

export function calculateFinanceAmounts(
  cashPrice: number,
  downPayment: number,
  installmentCount: number
): FinanceCalculationResult {
  // Reject non-finite values
  if (!Number.isFinite(cashPrice) || !Number.isFinite(downPayment) || !Number.isFinite(installmentCount)) {
    throw new Error('Değerler sonlu sayılar olmalıdır.');
  }

  // Input validation
  if (cashPrice < 0) {
    throw new Error('Satış bedeli negatif olamaz.');
  }
  if (downPayment < 0) {
    throw new Error('Peşinat bedeli negatif olamaz.');
  }
  if (downPayment > cashPrice) {
    throw new Error('Peşinat satış bedelinden büyük olamaz.');
  }
  if (installmentCount < FINANCE_MIN_INSTALLMENTS || installmentCount > FINANCE_MAX_INSTALLMENTS || !Number.isInteger(installmentCount)) {
    throw new Error('Taksit sayısı yalnız 1, 2 veya 3 olabilir.');
  }

  // Cent-based calculations
  const cashPriceCents = Math.round(cashPrice * 100);
  const downPaymentCents = Math.round(downPayment * 100);
  const financedPrincipalCents = cashPriceCents - downPaymentCents;

  const termRatePercent = getFinanceTermRatePercent(installmentCount);
  const chargeCents = Math.round((financedPrincipalCents * termRatePercent) / 100);
  const totalDueCents = financedPrincipalCents + chargeCents;

  const baseInstallmentCents = Math.floor(totalDueCents / installmentCount);

  const installments: Array<{ installmentNo: number; amount: number }> = [];
  let allocatedCents = 0;

  for (let i = 1; i < installmentCount; i++) {
    installments.push({
      installmentNo: i,
      amount: baseInstallmentCents / 100,
    });
    allocatedCents += baseInstallmentCents;
  }

  const lastInstallmentCents = totalDueCents - allocatedCents;
  installments.push({
    installmentNo: installmentCount,
    amount: lastInstallmentCents / 100,
  });

  return {
    financedPrincipal: financedPrincipalCents / 100,
    monthlyRatePercent: FINANCE_MONTHLY_RATE_PERCENT,
    termRatePercent,
    chargeAmount: chargeCents / 100,
    totalDueAmount: totalDueCents / 100,
    installments,
  };
}
