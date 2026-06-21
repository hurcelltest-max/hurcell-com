import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: adminUser, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (adminErr || !adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Bu işlem için admin yetkisine sahip olmalısınız.' }, { status: 403 });
    }

    const { batch_id } = await request.json();

    if (!batch_id) {
      return NextResponse.json({ error: 'Geçersiz işlem kimliği (batch_id).' }, { status: 400 });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('rollback_price_batch', {
      p_batch_id: batch_id,
      p_admin_user_id: user.id
    });

    if (rpcError) {
      console.error('Rollback Error:', rpcError);
      return NextResponse.json({ error: rpcError.message || 'Geri alma sırasında hata oluştu.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Rollback unexpected error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
