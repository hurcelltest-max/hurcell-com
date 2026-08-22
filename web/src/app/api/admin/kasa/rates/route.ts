import { NextResponse } from 'next/server';
import { requireManagerAuth } from '@/lib/kasa/auth';
import { getTCMBExchangeRates, saveManualExchangeRate } from '@/lib/kasa/tcmb';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    await requireManagerAuth();
    const supabase = getSupabaseAdmin();

    const { data: history } = await supabase
      .from('kasa_exchange_rates')
      .select('*')
      .order('rate_as_of', { ascending: false })
      .limit(50);

    const currentRates = await getTCMBExchangeRates();

    return NextResponse.json({ currentRates, history: history || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireManagerAuth();
    const body = await req.json();
    const { currency_code, rate_numeric } = body;

    if (!currency_code || !['USD', 'EUR'].includes(currency_code)) {
      return NextResponse.json({ error: 'Geçerli para birimi seçin (USD/EUR).' }, { status: 400 });
    }
    if (!rate_numeric || Number(rate_numeric) <= 0) {
      return NextResponse.json({ error: 'Geçerli bir kur değeri girin.' }, { status: 400 });
    }

    await saveManualExchangeRate(auth.user.id, currency_code, Number(rate_numeric));
    const currentRates = await getTCMBExchangeRates();

    return NextResponse.json({ success: true, currentRates });
  } catch (error: any) {
    if (error.message?.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { error: 'Manuel kur güncelleme yalnızca yöneticilere aittir.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message || 'Manuel kur güncellenemedi.' }, { status: 400 });
  }
}
