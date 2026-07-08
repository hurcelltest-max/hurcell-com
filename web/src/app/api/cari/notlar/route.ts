import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json({ error: 'Müşteri ID eksik.' }, { status: 400 });
    }

    const { data: notes, error } = await supabaseAdmin
      .from('credit_customer_notes')
      .select('*')
      .eq('credit_customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ notes });
  } catch (err) {
    console.error('[CARI GET NOTES ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerId, note } = body;

    if (!customerId || !note) {
      return NextResponse.json({ error: 'Eksik veri.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('credit_customer_notes')
      .insert({
        credit_customer_id: customerId,
        note
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[CARI POST NOTE ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
