import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const dhlUsername = process.env.DHL_API_USERNAME;
    const dhlPassword = process.env.DHL_API_PASSWORD;
    const dhlBaseUrl = process.env.DHL_API_BASE_URL;

    if (!dhlUsername || !dhlPassword || !dhlBaseUrl) {
      return NextResponse.json(
        { ok: false, message: "DHL API bilgileri tanımlı değil." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, message: "DHL API bilgileri tanımlı.", configured: true },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
