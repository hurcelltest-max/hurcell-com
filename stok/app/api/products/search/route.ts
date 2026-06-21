import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 3) {
      return NextResponse.json({ error: 'Arama kelimesi en az 3 karakter olmalıdır.' }, { status: 400 });
    }

    const supabaseAuth = await createSupabaseServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    // Server-side Service Role Client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify admin role
    const { data: adminUser, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (adminErr || !adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Bu işlem için admin yetkisine sahip olmalısınız.' }, { status: 403 });
    }

    // Call secure search RPC
    const { data: products, error } = await supabaseAdmin.rpc('search_products', {
      p_search_term: q.trim(),
      p_limit: 10
    });

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json({ error: 'Arama sırasında bir hata oluştu.' }, { status: 500 });
    }

    return NextResponse.json(products);
  } catch (err: unknown) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Beklenmeyen bir hata oluştu.' }, { status: 500 });
  }
}
