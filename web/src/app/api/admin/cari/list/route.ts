import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

export async function GET(req: Request) {
  try {
    // 1. Auth Protection
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    // 2. Parse Query Parameters
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const risk = searchParams.get('risk') || '';
    const search = searchParams.get('search') || '';

    let page = parseInt(searchParams.get('page') || '1', 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(searchParams.get('limit') || '20', 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    // 3. Call the RPC Function
    const { data, error } = await getSupabaseAdmin().rpc('get_admin_credit_customers_with_scores', {
      p_status: status,
      p_risk: risk,
      p_search: search,
      p_page: page,
      p_limit: limit
    });

    if (error) {
      console.error('[ADMIN CARI LIST RPC ERROR]', error);
      return NextResponse.json({ error: 'Veritabanı hatası oluştu.' }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('[ADMIN CARI LIST INTERNAL ERROR]', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
