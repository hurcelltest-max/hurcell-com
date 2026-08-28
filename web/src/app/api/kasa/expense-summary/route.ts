import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getOrCreateTodayDay, getDailyExpenseCategorySummary, getDailyTSDirectCosts } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    const dayIdParam = searchParams.get('day_id');

    const targetDay = dayIdParam ? { id: dayIdParam } : await getOrCreateTodayDay(auth.user.id);
    const summary = await getDailyExpenseCategorySummary(targetDay.id, auth.user.role);
    const tsCosts = await getDailyTSDirectCosts(targetDay.id);

    return NextResponse.json({
      expenseSummary: summary,
      tsDirectCosts: tsCosts.items,
      tsSubtotals: tsCosts.subtotals,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
