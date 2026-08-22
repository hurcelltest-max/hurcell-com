import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import {
  depositToBankTransaction,
  getOrCreateTodayDay,
  listDailyBankDeposits,
} from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireManagerAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const bankDeposits = await listDailyBankDeposits(todayDay.id);

    return NextResponse.json({ bankDeposits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();

    const { amount_tl, bank_name, reference_no, description, idempotency_key } = body;

    if (!amount_tl || Number(amount_tl) <= 0) {
      return NextResponse.json({ error: 'Yatırılacak tutar 0 veya negatif olamaz.' }, { status: 400 });
    }

    const amountKurus = Math.round(Number(amount_tl) * 100);
    const todayDay = await getOrCreateTodayDay(auth.user.id);

    const deposit = await depositToBankTransaction(
      auth.user.id,
      todayDay.id,
      amountKurus,
      bank_name ? String(bank_name).trim() : undefined,
      reference_no ? String(reference_no).trim() : undefined,
      description ? String(description).trim() : undefined,
      idempotency_key ? String(idempotency_key).trim() : undefined
    );

    return NextResponse.json({ success: true, deposit });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Bankaya para yatırma işlemi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Banka yatırma işlemi başarısız.' }, { status: 400 });
  }
}
