import { NextResponse } from 'next/server';
import { clearKasaSessionCookie } from '@/lib/kasa/session';

export async function POST() {
  await clearKasaSessionCookie();
  return NextResponse.json({ success: true });
}
