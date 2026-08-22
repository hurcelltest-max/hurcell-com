import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import {
  getDailyCategorySummary,
  getDashboardMetrics,
  getOrCreateTodayDay,
} from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const categorySummary = await getDailyCategorySummary(todayDay.id);
    const metrics = await getDashboardMetrics(todayDay.id);

    return NextResponse.json({
      day: todayDay,
      metrics,
      categorySummary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
