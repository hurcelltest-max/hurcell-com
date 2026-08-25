import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import {
  depositToBankTransaction,
  getOrCreateTodayDay,
  listDailyBankDeposits,
  getDashboardMetrics,
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

    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const dashboard = await getDashboardMetrics(todayDay.id, auth.user.role);
    const maxAllowedDepositKurus = Math.max(dashboard.expected_cash_kurus - dashboard.cash_reserve_target_kurus, 0);

    if (maxAllowedDepositKurus <= 0) {
      return NextResponse.json(
        { error: 'Kasada hedef rezervi (15.000 TL) aşan fazla fiziki nakit bulunmamaktadır.' },
        { status: 400 }
      );
    }

    let amountKurus = amount_tl ? Math.round(Number(amount_tl) * 100) : maxAllowedDepositKurus;

    if (amountKurus <= 0) {
      return NextResponse.json({ error: 'Yatırılacak tutar 0 veya negatif olamaz.' }, { status: 400 });
    }

    if (amountKurus > maxAllowedDepositKurus) {
      return NextResponse.json(
        { error: `Yatırılacak tutar kasadaki fazla nakitten (${(maxAllowedDepositKurus / 100).toLocaleString('tr-TR')} TL) büyük olamaz.` },
        { status: 400 }
      );
    }

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
