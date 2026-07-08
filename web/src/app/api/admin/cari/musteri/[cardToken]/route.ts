import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request, { params }: { params: { cardToken: string } }) {
  try {
    const token = params.cardToken;

    if (!token) {
      return NextResponse.json({ error: 'Token eksik' }, { status: 400 });
    }

    const { data: customer, error: custError } = await supabaseAdmin
      .from('credit_customers')
      .select(`
        id, customer_card_code, card_token, full_name, phone, address, city, district, status,
        credit_accounts ( id, credit_limit, current_balance, statement_day, status ),
        credit_agreement_acceptances ( id, accepted_at ),
        credit_audit_logs ( id, admin_username, action_type, old_value, new_value, reason, created_at )
      `)
      .eq('card_token', token)
      .maybeSingle();

    if (custError || !customer) {
      return NextResponse.json({ error: 'Müşteri bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (err) {
    console.error('[CARI GET CUSTOMER ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
  }
}
