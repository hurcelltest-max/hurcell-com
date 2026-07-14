import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

export async function GET(req: Request) {
  const auth = requireAdminApi(req);
  if (!auth.ok) {
    return auth.response;
  }

  const response = NextResponse.json({
    ok: true,
    message: 'Dry-run modunda çalışıyor. DHL/MNG tarafında gerçek Track Shipment sorgulanmadı.',
    data: null
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
