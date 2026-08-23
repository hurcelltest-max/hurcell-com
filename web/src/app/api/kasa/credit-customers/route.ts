import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { searchCreditCustomers } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    if (q.length > 0 && q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const rawCustomers = await searchCreditCustomers(q);

    // Personel ve Yetkili Kullanıcı için Sanitized & Capped (Max 20) Çıktı
    const customers = rawCustomers.slice(0, 20).map((c) => ({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      available_limit_tl: c.available_limit_tl,
      credit_limit_tl: auth.user.role === 'yonetici' ? c.credit_limit_tl : undefined,
      current_balance_tl: auth.user.role === 'yonetici' ? c.current_balance_tl : undefined,
      is_approved: c.is_approved,
    }));

    return NextResponse.json({ customers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
