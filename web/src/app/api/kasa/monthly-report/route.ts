import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getMonthlyReport } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    let monthISO = searchParams.get('month');

    if (!monthISO || !/^\d{4}-\d{2}$/.test(monthISO)) {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      monthISO = `${yr}-${mo}`;
    }

    const report = await getMonthlyReport(monthISO, auth.user.role);
    return NextResponse.json({ report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Aylık bilanço alınamadı.' }, { status: 400 });
  }
}
