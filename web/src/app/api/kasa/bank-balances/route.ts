import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { listBankDailyBalances, recordBankDailyBalance, hasUserPermission } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    const dateVal = searchParams.get('date_val') || undefined;

    const items = await listBankDailyBalances(dateVal);
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka bakiyeleri alınamadı.' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();

    const hasPermission =
      auth.user.role === 'yonetici' ||
      (await hasUserPermission(auth.user.id, 'kasa.bank.balance.record'));

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'YETKİSİZ: Günlük banka bakiyesi girme yetkiniz bulunmamaktadır.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { bank_account_id, date_val, reported_balance_tl, justification } = body;

    if (!bank_account_id) {
      return NextResponse.json({ error: 'Banka hesabı seçilmelidir.' }, { status: 400 });
    }

    if (reported_balance_tl === undefined || reported_balance_tl === null || isNaN(Number(reported_balance_tl))) {
      return NextResponse.json({ error: 'Geçerli bir gerçek bakiye tutarı girilmelidir.' }, { status: 400 });
    }

    const balanceNum = Number(reported_balance_tl);
    if (balanceNum < 0) {
      return NextResponse.json({ error: 'Gerçek bakiye 0 veya daha büyük olmalıdır.' }, { status: 400 });
    }

    const reportedBalanceKurus = Math.round(balanceNum * 100);
    const targetDate = date_val || new Date().toISOString().split('T')[0];

    const result = await recordBankDailyBalance(
      auth.user.id,
      bank_account_id,
      targetDate,
      reportedBalanceKurus,
      justification || 'Günlük mutabakat kaydı'
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka bakiyesi kaydedilemedi.' }, { status: 400 });
  }
}
