import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import {
  getDailyCategorySummary,
  getDashboardMetrics,
  getOrCreateTodayDay,
  getDashboardCarryoverInfo,
} from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const categorySummary = await getDailyCategorySummary(todayDay.id);
    const metrics = await getDashboardMetrics(todayDay.id, auth.user.role);
    const carryoverInfo = await getDashboardCarryoverInfo(todayDay);

    return NextResponse.json({
      day: todayDay,
      metrics,
      categorySummary,
      carryoverInfo,
      is_previous_day_unclosed: Boolean(todayDay.is_previous_day_unclosed),
      unclosed_day_date: todayDay.unclosed_day_date || null,
      dashboard_status: todayDay.is_previous_day_unclosed ? 'previous_days_require_closing' : 'ok',
    });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Dashboard yüklenemedi.' }, { status: 500 });
  }
}
