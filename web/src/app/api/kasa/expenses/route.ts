import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import {
  createExpense,
  getOrCreateTodayDay,
  listDailyExpenses,
  listAllExpenses,
  getKasaExpenseCategories,
} from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'all';
    const statusFilter = (searchParams.get('status') || 'all') as 'all' | 'active' | 'cancelled';
    const categoryId = searchParams.get('category_id') || undefined;

    if (scope === 'today_only') {
      const todayDay = await getOrCreateTodayDay(auth.user.id);
      const expenses = await listDailyExpenses(todayDay.id, auth.user.role);
      return NextResponse.json({ expenses });
    }

    const expenses = await listAllExpenses({
      statusFilter,
      categoryId,
      actorRole: auth.user.role,
    });

    return NextResponse.json({ expenses });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ')) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Gider listesi veritabanından alınamadı.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const body = await req.json();
    const { expense_category_id, amount_tl, description, recipient_name } = body;

    if (!expense_category_id || !amount_tl || !description || !String(description).trim()) {
      return NextResponse.json(
        { error: 'Gider kategorisi, tutar ve açıklama zorunludur.' },
        { status: 400 }
      );
    }

    const categories = await getKasaExpenseCategories();
    const selectedCategory = categories.find((c) => c.id === String(expense_category_id));

    if (!selectedCategory) {
      return NextResponse.json({ error: 'Geçersiz veya bulunamayan gider kategorisi.' }, { status: 400 });
    }

    if (!selectedCategory.is_active) {
      return NextResponse.json({ error: 'Seçilen gider kategorisi pasiftir, kullanılamaz.' }, { status: 400 });
    }

    if (selectedCategory.is_salary_category && auth.user.role !== 'yonetici') {
      return NextResponse.json(
        { error: 'Personel maaşı kaydı yalnızca yöneticiler tarafından eklenebilir.' },
        { status: 403 }
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
        { error: 'Gider oluşturma yetkisi bulunmamaktadır.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Gider kaydı eklenemedi.' }, { status: 400 });
  }
}
