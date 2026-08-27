import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import {
  getDailyCategorySummary,
  getDashboardMetrics,
  getOrCreateTodayDay,
  getDashboardCarryoverInfo,
  getOpenDaysChain,
} from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const chain = await getOpenDaysChain(auth.user.id);

    const targetDay = todayDay;
    const categorySummary = await getDailyCategorySummary(targetDay.id);
    const metrics = await getDashboardMetrics(targetDay.id, auth.user.role);
    const carryoverInfo = await getDashboardCarryoverInfo(targetDay);

    return NextResponse.json({
      day: targetDay,
      metrics,
      categorySummary,
      carryoverInfo,
      open_days: chain.openDays,
      first_day_requiring_close: chain.firstDayRequiringClose,
      displayed_day: targetDay,
      dashboard_status: chain.dashboardStatus,
      action_block_reason: chain.actionBlockReason,
      is_previous_day_unclosed: chain.isPreviousDaysUnclosed,
      unclosed_day_date: chain.firstDayRequiringClose?.date_val || targetDay.date_val,
    });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Dashboard yüklenemedi.' }, { status: 500 });
  }
}
