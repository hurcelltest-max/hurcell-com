import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getOrCreateTodayDay, getDailyExpenseCategorySummary } from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const summary = await getDailyExpenseCategorySummary(todayDay.id, auth.user.role);

    return NextResponse.json({
      expenseSummary: summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
