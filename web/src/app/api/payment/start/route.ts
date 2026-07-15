import { NextResponse } from 'next/server';

export async function POST(_req: Request) {
  return NextResponse.json(
    { error: 'Online ödeme devre dışı. Siparişler DHL kapıda ödeme ile alınmaktadır.' },
    { status: 400 }
  );
}
