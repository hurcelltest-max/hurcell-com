import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  return NextResponse.json({ ok: false, message: 'Bu servis henüz hazır değil.' }, { status: 501 });
}
