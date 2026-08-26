import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { closeDayTransaction, getOrCreateTodayDay } from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();

    const { kasa_day_id, counted_cash_tl, closing_note, counted_usd, counted_eur } = body;

    if (counted_cash_tl === undefined || Number(counted_cash_tl) < 0) {
      return NextResponse.json({ error: 'Lütfen geçerli bir fiziki TL nakit sayımı giriniz.' }, { status: 400 });
    }

    const countedCashKurus = Math.round(Number(counted_cash_tl) * 100);
    const countedUsdCents = counted_usd !== undefined && counted_usd !== null && counted_usd !== '' ? Math.round(Number(counted_usd) * 100) : undefined;
    const countedEurCents = counted_eur !== undefined && counted_eur !== null && counted_eur !== '' ? Math.round(Number(counted_eur) * 100) : undefined;

    let targetDayId = kasa_day_id;
    if (!targetDayId) {
      const todayDay = await getOrCreateTodayDay(auth.user.id);
      targetDayId = todayDay.id;
    }

    const closedDay = await closeDayTransaction(
      auth.user.id,
      targetDayId,
      countedCashKurus,
      closing_note ? String(closing_note).trim() : undefined,
      countedUsdCents,
      countedEurCents
    );

    return NextResponse.json({ success: true, day: closedDay });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Gün sonu kapatma işlemi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Gün sonu kapatılamadı.' }, { status: 400 });
  }
}
