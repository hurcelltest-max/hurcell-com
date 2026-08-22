import { NextResponse } from 'next/server';
import { requireKasaAuth, requireManagerAuth } from '@/lib/kasa/auth';
import { getTCMBExchangeRates, saveManualExchangeRate } from '@/lib/kasa/tcmb';

export async function GET() {
  try {
    await requireKasaAuth();
    const rates = await getTCMBExchangeRates();
    return NextResponse.json({ rates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Döviz kurları alınamadı.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();
    const { currency_code, rate_numeric } = body;

    if (!currency_code || !['USD', 'EUR'].includes(currency_code)) {
      return NextResponse.json({ error: 'Lütfen geçerli para birimi seçin (USD/EUR).' }, { status: 400 });
    }
    if (!rate_numeric || Number(rate_numeric) <= 0) {
      return NextResponse.json({ error: 'Lütfen geçerli pozitif kur değeri girin.' }, { status: 400 });
    }

    await saveManualExchangeRate(auth.user.id, currency_code, Number(rate_numeric));
    const rates = await getTCMBExchangeRates();

    return NextResponse.json({ success: true, rates });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'Manuel kur güncelleme yalnızca yöneticilere aittir.' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || 'Manuel kur güncellenemedi.' }, { status: 400 });
  }
}
