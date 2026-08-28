import { KasaDay } from './types';

export function isSaleCostMissing(sale: {
  category_name?: string;
  service_cost_payment_status?: string | null;
  service_cost_kurus?: number | null;
  cost_price_kurus?: number | null;
  status?: string;
  total_price_kurus?: number | null;
}): boolean {
  if (sale.status && sale.status !== 'completed') return false;

  const catName = sale.category_name || '';

  if (catName === 'Teknik Servis') {
    const st = sale.service_cost_payment_status;
    if (st === 'no_cost') return false; // no_cost is a completed zero-cost sale
    if (st === 'paid_from_cash' || st === 'previously_paid_or_stock' || st === 'unpaid') {
      return (sale.service_cost_kurus ?? 0) <= 0;
    }
    // legacy_unspecified or NULL is missing cost
    return true;
  } else {
    // Non-Teknik Servis (Aksesuar, Telefon, Fotokopi vb.):
    // Evaluate cost_price_kurus (product cost).
    // Note: service_cost_payment_status or service_cost_kurus MUST NOT be used for non-technical sales!
    const totalPrice = Number(sale.total_price_kurus ?? 0);
    return (sale.cost_price_kurus == null || Number(sale.cost_price_kurus) === 0) && totalPrice > 0;
  }
}

export interface OpenDaysChainResult {
  openDays: KasaDay[];
  firstDayRequiringClose: KasaDay | null;
  displayedDay: KasaDay | null;
  isPreviousDaysUnclosed: boolean;
  dashboardStatus: 'ok' | 'previous_days_require_closing';
  actionBlockReason: string | null;
}

export function evaluateOpenDaysChain(openDays: KasaDay[], todayIsoDate: string): OpenDaysChainResult {
  if (!openDays || openDays.length === 0) {
    return {
      openDays: [],
      firstDayRequiringClose: null,
      displayedDay: null,
      isPreviousDaysUnclosed: false,
      dashboardStatus: 'ok',
      actionBlockReason: null,
    };
  }

  // Sort ascending by date_val
  const sortedDays = [...openDays].sort((a, b) => a.date_val.localeCompare(b.date_val));
  const firstUnclosed = sortedDays[0];
  const lastOpen = sortedDays[sortedDays.length - 1];

  const hasMultipleOpenDays = sortedDays.length > 1;
  const isFirstUnclosedPast = firstUnclosed.date_val < todayIsoDate;

  if (hasMultipleOpenDays || isFirstUnclosedPast) {
    const datesList = sortedDays.map((d) => d.date_val).join(' → ');
    return {
      openDays: sortedDays,
      firstDayRequiringClose: firstUnclosed,
      displayedDay: lastOpen,
      isPreviousDaysUnclosed: true,
      dashboardStatus: 'previous_days_require_closing',
      actionBlockReason: `Önceki kasa günleri kapatılmadan yeni gün başlatılamaz. Kapanış sırası: ${datesList}. Kilitli günleri sırayla kapatın.`,
    };
  }

  return {
    openDays: sortedDays,
    firstDayRequiringClose: null,
    displayedDay: sortedDays[0],
    isPreviousDaysUnclosed: false,
    dashboardStatus: 'ok',
    actionBlockReason: null,
  };
}

export interface DayCreationValidationParams {
  openDays: { id: string; date_val: string; status: string }[];
  previousClosedDay?: { id: string; date_val: string; counted_cash_kurus?: number | null } | null;
  todayIsoDate: string;
}

export function validateDayCreationRules(params: DayCreationValidationParams): {
  allowed: boolean;
  openingBalanceKurus: number;
  error: string | null;
} {
  // Rule 1: Cannot create new day if older open day exists
  const unclosedOlder = params.openDays.find((d) => d.status === 'open' && d.date_val < params.todayIsoDate);
  if (unclosedOlder) {
    return {
      allowed: false,
      openingBalanceKurus: 0,
      error: `PREVIOUS_DAY_UNCLOSED: ${unclosedOlder.date_val} tarihli kasa günü henüz kapatılmamış.`,
    };
  }

  // Rule 2 & 3: Opening balance must come from previous closed day counted cash
  if (params.previousClosedDay) {
    if (params.previousClosedDay.counted_cash_kurus == null) {
      return {
        allowed: false,
        openingBalanceKurus: 0,
        error: `KAYNAK_BAKİYE_EKSİK: Önceki kapatılan günün (${params.previousClosedDay.date_val}) sayılan nakit tutarı bulunamadı.`,
      };
    }
    return {
      allowed: true,
      openingBalanceKurus: Number(params.previousClosedDay.counted_cash_kurus),
      error: null,
    };
  }

  // System genesis (first day ever)
  return {
    allowed: true,
    openingBalanceKurus: 0,
    error: null,
  };
}

export function evaluateOpeningBalanceCorrection(
  todayOpeningBalanceKurus: number,
  expectedOpeningBalanceKurus: number,
  hasFinancialMovements: boolean
): { canAutoCorrect: boolean; action: 'auto_update' | 'require_manager_repair' | 'no_action_needed'; error: string | null } {
  if (todayOpeningBalanceKurus === expectedOpeningBalanceKurus) {
    return { canAutoCorrect: true, action: 'no_action_needed', error: null };
  }

  if (!hasFinancialMovements) {
    return { canAutoCorrect: true, action: 'auto_update', error: null };
  }

  return {
    canAutoCorrect: false,
    action: 'require_manager_repair',
    error: 'Açılış bakiyesi ile önceki gün kapanış sayımı uyuşmuyor. Günlük hareketler bulunduğu için yönetici devir onarımı gereklidir.',
  };
}

export function calculateProfitWithoutCarryover(
  grossSalesKurus: number,
  returnsKurus: number,
  productCostKurus: number,
  serviceCostKurus: number,
  expensesKurus: number,
  realizedFxDiffKurus: number = 0
): number {
  // Opening balance is NEVER added to profit
  return grossSalesKurus - returnsKurus - productCostKurus - serviceCostKurus - expensesKurus + realizedFxDiffKurus;
}

export function simulate3DayRegression(): {
  day1Opening: number;
  day1Closing: number;
  day2Opening: number;
  day2Closing: number;
  day3Opening: number;
} {
  // Day 1: 13.500 TL initial capital + 15 TL cash sale = 13.515 TL closing
  const day1Opening = 1350000; // 13.500 TL in kuruş
  const day1Sale = 1500;       // 15 TL in kuruş
  const day1Closing = day1Opening + day1Sale; // 13.515 TL (1.351.500 kuruş)

  // Day 2: 13.515 TL opening + 230 TL cash sale = 13.745 TL closing
  const day2Opening = day1Closing; // 1.351.500 kuruş
  const day2Sale = 23000;          // 230 TL in kuruş
  const day2Closing = day2Opening + day2Sale; // 13.745 TL (1.374.500 kuruş)

  // Day 3: Opening must equal Day 2 closing
  const day3Opening = day2Closing; // 1.374.500 kuruş (13.745 TL)

  return {
    day1Opening,
    day1Closing,
    day2Opening,
    day2Closing,
    day3Opening,
  };
}

export function canEditSale(input: {
  role?: 'yonetici' | 'personel';
  currentUserId?: string;
  saleCreatedByUserId?: string;
  saleStatus?: string;
  dayStatus?: string;
  movementType?: string;
}): boolean {
  if (input.movementType !== 'satis') return false;
  if (input.saleStatus !== 'completed') return false;
  if (input.dayStatus !== 'open') return false;
  if (!input.role || !input.currentUserId) return false;
  if (input.role === 'yonetici') return true;
  return input.saleCreatedByUserId === input.currentUserId;
}

export function canCancelSale(input: {
  role?: 'yonetici' | 'personel';
  saleStatus?: string;
  dayStatus?: string;
  movementType?: string;
}): boolean {
  if (input.movementType !== 'satis') return false;
  if (input.saleStatus !== 'completed') return false;
  if (input.dayStatus !== 'open') return false;
  return input.role === 'yonetici';
}

export function canEditExpense(input: {
  role?: 'yonetici' | 'personel';
  currentUserId?: string;
  expenseCreatedByUserId?: string;
  expenseStatus?: string;
  dayStatus?: string;
  isSalaryCategory?: boolean;
}): boolean {
  if (input.expenseStatus !== 'active') return false;
  if (input.dayStatus !== 'open') return false;
  if (!input.role || !input.currentUserId) return false;
  if (input.role === 'yonetici') return true;
  if (input.isSalaryCategory) return false;
  return input.expenseCreatedByUserId === input.currentUserId;
}

export function canCancelExpense(input: {
  role?: 'yonetici' | 'personel';
  currentUserId?: string;
  expenseCreatedByUserId?: string;
  expenseStatus?: string;
  dayStatus?: string;
  isSalaryCategory?: boolean;
}): boolean {
  if (input.expenseStatus !== 'active') return false;
  if (input.dayStatus !== 'open') return false;
  if (!input.role || !input.currentUserId) return false;
  if (input.role === 'yonetici') return true;
  if (input.isSalaryCategory) return false;
  return input.expenseCreatedByUserId === input.currentUserId;
}
