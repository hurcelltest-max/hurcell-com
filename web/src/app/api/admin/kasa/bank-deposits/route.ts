import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Kasadan bankaya yatırma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { kasa_day_id, bank_account_id, amount_minor, description, reference_no, idempotency_key } = body;

    if (!kasa_day_id || !bank_account_id || !amount_minor || Number(amount_minor) <= 0 || !idempotency_key) {
      return NextResponse.json({ error: 'Kasa günü, banka hesabı, tutar ve idempotency_key zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_deposit_cash_to_bank', {
      p_actor_user_id: auth.user.id,
      p_kasa_day_id: kasa_day_id,
      p_bank_account_id: bank_account_id,
      p_amount_kurus: Number(amount_minor),
      p_description: description ? String(description).trim() : null,
      p_reference_no: reference_no ? String(reference_no).trim() : null,
      p_idempotency_key: String(idempotency_key).trim(),
    });

    if (error) throw new Error(error.message || 'Kasadan bankaya yatırma gerçekleştirilemedi.');

    return NextResponse.json({ success: true, deposit: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kasadan bankaya yatırma gerçekleştirilemedi.' }, { status: 400 });
  }
}
