import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { searchCreditCustomers, listCreditCustomersWithStatus } from '@/lib/kasa/service';

export async function GET(req: Request) {
  try {
    await requireKasaAuth();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (q !== null && q !== undefined) {
      const customers = await searchCreditCustomers(q);
      return NextResponse.json({ customers });
    }

    const customers = await listCreditCustomersWithStatus();
    return NextResponse.json({ customers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}
