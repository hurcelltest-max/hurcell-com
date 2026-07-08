import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Arama terimi eksik.' }, { status: 400 });
    }

    let customerQuery = supabaseAdmin.from('credit_customers').select('card_token').limit(1);

    if (query.toUpperCase().startsWith('HRC')) {
      customerQuery = customerQuery.eq('customer_card_code', query.toUpperCase());
    } else {
      const normalizedPhone = normalizeTurkishPhoneNumber(query);
      customerQuery = customerQuery.eq('phone_normalized', normalizedPhone);
    }

    const { data, error } = await customerQuery.maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ card_token: data.card_token });
  } catch (err) {
    console.error('[CARI SEARCH ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
