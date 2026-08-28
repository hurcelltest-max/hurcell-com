import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getKasaExpenseCategories } from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const categories = await getKasaExpenseCategories();

    const items = categories
      .filter((c) => {
        if (!c.is_active) return false;
        if (auth.user.role === 'personel' && c.is_salary_category) return false;
        return true;
      })
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name, 'tr'))
      .map((c) => ({
        id: c.id,
        name: c.name,
        is_active: c.is_active,
        is_salary_category: c.is_salary_category,
        display_order: c.display_order,
      }));

    return NextResponse.json({ items });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN') || error.message?.includes('YETKİSİZ') || error.message?.includes('Oturum')) {
      return NextResponse.json({ error: 'Gider kategorilerini görüntüleme yetkiniz bulunmamaktadır.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Gider kategorileri veritabanından alınamadı.' }, { status: 500 });
  }
}
