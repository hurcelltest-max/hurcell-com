import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    if (auth.user.role !== 'yonetici') {
      return NextResponse.json({ error: 'POS ayarlarını yapılandırma yalnızca yöneticilere açıktır.' }, { status: 403 });
    }

    const body = await req.json();
    const { pos_tracking_start_at, opening_pos_receivable_minor, justification } = body;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('fn_kasa_configure_pos_settings', {
      p_actor_user_id: auth.user.id,
      p_pos_tracking_start_at: pos_tracking_start_at || new Date().toISOString(),
      p_opening_pos_receivable_kurus: Number(opening_pos_receivable_minor || 0),
      p_justification: justification ? String(justification).trim() : null,
    });

    if (error) throw new Error(error.message || 'POS ayarları kaydedilemedi.');

    return NextResponse.json({ success: true, settings: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'POS ayarları kaydedilemedi.' }, { status: 400 });
  }
}
