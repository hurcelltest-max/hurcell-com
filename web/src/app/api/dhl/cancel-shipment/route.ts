import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

export async function PUT(req: Request) {
  const auth = requireAdminApi(req);
  if (!auth.ok) {
    return auth.response;
  }

  const response = NextResponse.json({ ok: false, message: 'Bu servis henüz hazır değil.' }, { status: 501 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
