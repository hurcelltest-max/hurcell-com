import { NextResponse } from 'next/server';
import { getVerifiedKasaSession } from '@/lib/kasa/auth';

export async function GET() {
  const auth = await getVerifiedKasaSession();
  if (!auth) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: auth.user.id,
      username: auth.user.username,
      full_name: auth.user.full_name,
      role: auth.user.role,
    },
  });
}
