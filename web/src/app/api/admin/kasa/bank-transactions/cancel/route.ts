import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'Banka işlemi iptali yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { transaction_id, cancel_reason } = body;

    if (!transaction_id || !cancel_reason || String(cancel_reason).trim().length < 3) {
      return NextResponse.json({ error: 'İptal edilecek işlem ve en az 3 karakterli gerekçe zorunludur.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_cancel_bank_transaction', {
      p_actor_user_id: auth.user.id,
      p_transaction_id: transaction_id,
      p_cancel_reason: String(cancel_reason).trim(),
    });

    if (error) throw new Error(error.message || 'Banka işlemi iptal edilemedi.');

    return NextResponse.json({ success: true, result: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Banka işlemi iptal edilemedi.' }, { status: 400 });
  }
}
