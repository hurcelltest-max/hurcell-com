import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getPeriodReportMetrics } from '@/lib/kasa/service';

function getDatesForPeriod(period: string, customStart?: string, customEnd?: string) {
  const now = new Date();

  // Türkiye tarihini al (YYYY-MM-DD)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' });
  const todayStr = formatter.format(now); // e.g. 2026-08-23

  const parts = todayStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1]; // 1-indexed
  const day = parts[2];

  if (period === 'gunluk') {
    return {
      periodName: 'Günlük Rapor',
      startDate: todayStr,
      endDate: todayStr,
      displayRange: `${todayStr}`,
    };
  }

  if (period === 'haftalik') {
    // Mevcut haftanın Pazartesi ve Pazar gününü bul
    const todayDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = todayDate.getUTCDay(); // 0: Sun, 1: Mon, ...
    const distToMon = (dayOfWeek + 6) % 7;

    const mondayDate = new Date(todayDate);
    mondayDate.setUTCDate(todayDate.getUTCDate() - distToMon);

    const sundayDate = new Date(mondayDate);
    sundayDate.setUTCDate(mondayDate.getUTCDate() + 6);

    const startStr = mondayDate.toISOString().split('T')[0];
    const endStr = sundayDate.toISOString().split('T')[0];

    return {
      periodName: 'Haftalık Rapor',
      startDate: startStr,
      endDate: endStr,
      displayRange: `${startStr} (Pazartesi) - ${endStr} (Pazar)`,
    };
  }

  if (period === 'aylik') {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    return {
      periodName: 'Aylık Rapor',
      startDate: startStr,
      endDate: endStr,
      displayRange: `${startStr} - ${endStr}`,
    };
  }

  if (period === 'yillik') {
    return {
      periodName: 'Yıllık Rapor',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      displayRange: `1 Ocak ${year} - 31 Aralık ${year}`,
    };
  }

  if (period === 'custom' && customStart && customEnd) {
    return {
      periodName: 'Özel Tarih Aralığı Raporu',
      startDate: customStart,
      endDate: customEnd,
      displayRange: `${customStart} - ${customEnd}`,
    };
  }

  return {
    periodName: 'Günlük Rapor',
    startDate: todayStr,
    endDate: todayStr,
    displayRange: `${todayStr}`,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);

    const period = searchParams.get('period') || 'gunluk';
    const customStart = searchParams.get('startDate') || undefined;
    const customEnd = searchParams.get('endDate') || undefined;

    const rangeInfo = getDatesForPeriod(period, customStart, customEnd);
    const metrics = await getPeriodReportMetrics(
      rangeInfo.periodName,
      rangeInfo.startDate,
      rangeInfo.endDate,
      auth.user.role
    );

    return NextResponse.json({
      success: true,
      status: 'ready',
      period,
      displayRange: rangeInfo.displayRange,
      metrics,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
