import { NextResponse } from 'next/server';
import { requireKasaAuth, requireManagerAuth } from '@/lib/kasa/auth';
import { createExpense, getOrCreateTodayDay, listDailyExpenses } from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const expenses = await listDailyExpenses(todayDay.id, auth.user.role);

    return NextResponse.json({ expenses });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    // İş kuralı #8: Gider ve maaş kaydı yalnızca yetkili yönetici tarafından eklenebilir
    const auth = await requireManagerAuth();
    const body = await req.json();
    const { expense_category_id, amount_tl, description, recipient_name } = body;

    if (!expense_category_id || !amount_tl || !description || !String(description).trim()) {
      return NextResponse.json(
        { error: 'Gider kategorisi, tutar ve açıklama zorunludur.' },
        { status: 400 }
      );
    }

    const amountKurus = Math.round(Number(amount_tl) * 100);
    if (amountKurus <= 0) {
      return NextResponse.json({ error: 'Gider tutarı 0 veya negatif olamaz.' }, { status: 400 });
    }

    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const expense = await createExpense(
      auth.user.id,
      todayDay.id,
      String(expense_category_id),
      amountKurus,
      String(description).trim(),
      recipient_name ? String(recipient_name).trim() : undefined
    );

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Gider ve maaş kaydı oluşturma yetkisi yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Gider kaydı eklenemedi.' }, { status: 400 });
  }
}
