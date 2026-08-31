import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Bankadan patron çekimi yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { bank_account_id, amount_minor, transaction_date, description, reference_no, idempotency_key } = body;

    if (!bank_account_id || !amount_minor || Number(amount_minor) <= 0 || !description || !idempotency_key) {
      return NextResponse.json({ error: 'Banka hesabı, tutar, açıklama ve idempotency_key zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_withdraw_owner_capital_from_bank', {
      p_actor_user_id: auth.user.id,
      p_bank_account_id: bank_account_id,
      p_amount_kurus: Number(amount_minor),
      p_transaction_date: transaction_date || new Date().toISOString().split('T')[0],
      p_description: String(description).trim(),
      p_reference_no: reference_no ? String(reference_no).trim() : null,
      p_idempotency_key: String(idempotency_key).trim(),
    });

    if (error) throw new Error(error.message || 'Bankadan patron çekimi gerçekleştirilemedi.');

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Bankadan patron çekimi gerçekleştirilemedi.' }, { status: 400 });
  }
}
