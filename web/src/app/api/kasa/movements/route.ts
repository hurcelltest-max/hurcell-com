import { NextRequest, NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getOrCreateTodayDay, getUnifiedDailyMovements } from '@/lib/kasa/service';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireKasaAuth();
    const searchParams = request.nextUrl.searchParams;
    const kasaDayIdParam = searchParams.get('kasa_day_id');
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const movementType = searchParams.get('movement_type') || undefined;
    const direction = (searchParams.get('direction') as any) || undefined;
    const page = Number(searchParams.get('page')) || 1;
    const pageSize = Number(searchParams.get('page_size')) || 50;

    let kasaDayId = kasaDayIdParam;

    if (!kasaDayId && !startDate && !endDate) {
      try {
        const todayDay = await getOrCreateTodayDay(auth.user.id);
        kasaDayId = todayDay.id;
      } catch (err: any) {
        // Unclosed day error will be handled by UI or day ID provided
      }
    }

    const result = await getUnifiedDailyMovements({
      kasaDayId: kasaDayId || undefined,
      startDate,
      endDate,
      movementType,
      direction,
      page,
      pageSize,
      actorRole: auth.user.role,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Veriler okunamadı.' }, { status: 500 });
  }
}
