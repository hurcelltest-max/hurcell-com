import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { convertFXToTRYTransaction, getOrCreateTodayDay } from '@/lib/kasa/service';

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();

    const { currency_code, foreign_amount, actual_rate, description, idempotency_key } = body;

    if (!currency_code || !['USD', 'EUR'].includes(currency_code)) {
      return NextResponse.json({ error: 'Geçersiz para birimi.' }, { status: 400 });
    }
    if (!foreign_amount || Number(foreign_amount) <= 0) {
      return NextResponse.json({ error: 'Bozdurulacak miktar 0 veya daha küçük olamaz.' }, { status: 400 });
    }
    if (!actual_rate || Number(actual_rate) <= 0) {
      return NextResponse.json({ error: 'Geçerli bir bozdurma kuru giriniz.' }, { status: 400 });
    }

    const foreignAmountCents = Math.round(Number(foreign_amount) * 100);
    const todayDay = await getOrCreateTodayDay(auth.user.id);

    const transaction = await convertFXToTRYTransaction(
      auth.user.id,
      todayDay.id,
      currency_code,
      foreignAmountCents,
      Number(actual_rate),
      description ? String(description).trim() : undefined,
      idempotency_key ? String(idempotency_key).trim() : undefined
    );

    return NextResponse.json({ success: true, transaction });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Döviz bozdurma işlemi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Döviz bozdurma işlemi başarısız.' }, { status: 400 });
  }
}
