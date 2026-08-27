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
