import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { injectFXCapitalTransaction, getOrCreateTodayDay } from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();

    const { currency_code, foreign_amount, exchange_rate, description } = body;

    if (!currency_code || !['USD', 'EUR'].includes(currency_code)) {
      return NextResponse.json({ error: 'Geçersiz para birimi.' }, { status: 400 });
    }
    if (!foreign_amount || Number(foreign_amount) <= 0) {
      return NextResponse.json({ error: 'Sermaye miktarı 0 veya negatif olamaz.' }, { status: 400 });
    }
    if (!exchange_rate || Number(exchange_rate) <= 0) {
      return NextResponse.json({ error: 'Geçerli bir işlem kuru giriniz.' }, { status: 400 });
    }

    const foreignAmountCents = Math.round(Number(foreign_amount) * 100);
    const todayDay = await getOrCreateTodayDay(auth.user.id);

    const transaction = await injectFXCapitalTransaction(
      auth.user.id,
      todayDay.id,
      currency_code,
      foreignAmountCents,
      Number(exchange_rate),
      description ? String(description).trim() : undefined
    );

    return NextResponse.json({ success: true, transaction });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Döviz sermayesi ekleme işlemi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Döviz sermayesi eklenemedi.' }, { status: 400 });
  }
}
