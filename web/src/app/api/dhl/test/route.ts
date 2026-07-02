import { NextResponse } from 'next/server';

export async function GET() {
  const envStatus = {
    DHL_MNG_API_BASE_URL: !!process.env.DHL_MNG_API_BASE_URL,
    DHL_MNG_CLIENT_ID: !!process.env.DHL_MNG_CLIENT_ID,
    DHL_MNG_CLIENT_SECRET: !!process.env.DHL_MNG_CLIENT_SECRET,
    DHL_MNG_TOKEN_URL: !!process.env.DHL_MNG_TOKEN_URL,
    DHL_MNG_USERNAME: !!process.env.DHL_MNG_USERNAME,
    DHL_MNG_PASSWORD: !!process.env.DHL_MNG_PASSWORD,
    DHL_MNG_CUSTOMER_CODE: !!process.env.DHL_MNG_CUSTOMER_CODE,
  };

  const allConfigured = Object.values(envStatus).every(Boolean);

  if (allConfigured) {
    return NextResponse.json({ ok: true, message: 'DHL/MNG API yapılandırması tam.', envStatus });
  }

  return NextResponse.json({ ok: false, message: 'DHL/MNG API eksik yapılandırma.', envStatus }, { status: 400 });
}
