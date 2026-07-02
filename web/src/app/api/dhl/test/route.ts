import { NextResponse } from 'next/server';

export async function GET() {
  const envStatus = {
    DHL_MNG_API_BASE_URL: process.env.DHL_MNG_API_BASE_URL ? 'configured' : 'missing',
    DHL_MNG_CLIENT_ID: process.env.DHL_MNG_CLIENT_ID ? 'configured' : 'missing',
    DHL_MNG_CLIENT_SECRET: process.env.DHL_MNG_CLIENT_SECRET ? 'configured' : 'missing',
    DHL_MNG_TOKEN_URL: process.env.DHL_MNG_TOKEN_URL ? 'configured' : 'missing',
    DHL_MNG_USERNAME: process.env.DHL_MNG_USERNAME ? 'configured' : 'missing',
    DHL_MNG_PASSWORD: process.env.DHL_MNG_PASSWORD ? 'configured' : 'missing',
    DHL_MNG_CUSTOMER_CODE: process.env.DHL_MNG_CUSTOMER_CODE ? 'configured' : 'missing',
  };

  const allConfigured = Object.values(envStatus).every(val => val === 'configured');

  if (allConfigured) {
    return NextResponse.json({ ok: true, message: 'DHL/MNG API yapılandırması tam.', envStatus });
  }

  return NextResponse.json({ ok: false, message: 'DHL/MNG API eksik yapılandırma.', envStatus }, { status: 400 });
}
