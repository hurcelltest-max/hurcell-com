import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';

export async function GET(req: Request) {
  const auth = requireAdminApi(req);
  if (!auth.ok) {
    return auth.response;
  }

  const envStatus = {
    DHL_MNG_TEST_MODE: process.env.DHL_MNG_TEST_MODE ? 'configured' : 'missing',
    DHL_MNG_ENABLE_REAL_API: process.env.DHL_MNG_ENABLE_REAL_API === 'true',
    DHL_MNG_SANDBOX_BASE_URL: process.env.DHL_MNG_SANDBOX_BASE_URL ? 'configured' : 'missing',
    DHL_MNG_PROD_BASE_URL: process.env.DHL_MNG_PROD_BASE_URL ? 'configured' : 'missing',
    DHL_MNG_TOKEN_TEST_URL: process.env.DHL_MNG_TOKEN_TEST_URL ? 'confirmed' : 'missing',
    DHL_MNG_TOKEN_PROD_URL: process.env.DHL_MNG_TOKEN_PROD_URL ? 'confirmed' : 'missing',
    DHL_MNG_CLIENT_ID: process.env.DHL_MNG_CLIENT_ID ? 'configured' : 'missing',
    DHL_MNG_CLIENT_SECRET: process.env.DHL_MNG_CLIENT_SECRET ? 'configured' : 'missing',
    DHL_MNG_CUSTOMER_NUMBER: process.env.DHL_MNG_CUSTOMER_NUMBER ? 'configured' : 'missing',
    DHL_MNG_API_PASSWORD: process.env.DHL_MNG_API_PASSWORD ? 'configured' : 'missing',
    DHL_MNG_APP_NAME: process.env.DHL_MNG_APP_NAME ? 'configured' : 'missing',
    DHL_MNG_STATIC_OUTBOUND_IP: process.env.DHL_MNG_STATIC_OUTBOUND_IP ? 'configured' : 'missing',
    DHL_MNG_USE_STATIC_PROXY: process.env.DHL_MNG_USE_STATIC_PROXY ? 'configured' : 'missing',
    DHL_MNG_PROXY_URL: process.env.DHL_MNG_PROXY_URL ? 'configured' : 'missing',
  };

  const allConfigured = Object.entries(envStatus).every(([key, val]) => 
    key === 'DHL_MNG_ENABLE_REAL_API' ? true : (val === 'configured' || val === 'confirmed')
  );

  if (allConfigured) {
    const response = NextResponse.json({ ok: true, message: 'DHL/MNG API yapılandırması tam.', envStatus });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.json({ ok: false, message: 'DHL/MNG API eksik yapılandırma.', envStatus }, { status: 400 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
