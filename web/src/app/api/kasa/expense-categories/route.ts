import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getKasaExpenseCategories } from '@/lib/kasa/service';

export async function GET() {
  try {
    await requireKasaAuth();
    const categories = await getKasaExpenseCategories();
    return NextResponse.json({ categories });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
