import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Virman işlemi yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { source_account_id, target_account_id, amount_minor, transaction_date, description, reference_no } = body;

    if (!source_account_id || !target_account_id || !amount_minor || Number(amount_minor) <= 0) {
      return NextResponse.json({ error: 'Kaynak hesap, hedef hesap ve pozitif tutar zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_transfer_between_bank_accounts', {
      p_actor_user_id: auth.user.id,
      p_source_account_id: source_account_id,
      p_target_account_id: target_account_id,
      p_amount_kurus: Number(amount_minor),
      p_transaction_date: transaction_date || new Date().toISOString().split('T')[0],
      p_description: description ? String(description).trim() : null,
      p_reference_no: reference_no ? String(reference_no).trim() : null,
    });

    if (error) throw new Error(error.message || 'Virman işlemi gerçekleştirilemedi.');

    return NextResponse.json({ success: true, transfer: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Virman işlemi gerçekleştirilemedi.' }, { status: 400 });
  }
}
