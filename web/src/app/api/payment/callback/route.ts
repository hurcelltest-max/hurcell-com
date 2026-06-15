import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json(
    { error: 'Online ödeme devre dışı. Siparişler DHL kapıda ödeme ile alınmaktadır.' },
    { status: 400 }
  );
}
export async function GET(req: Request) {
  return NextResponse.json(
    { message: 'Online ödeme devre dışı. Siparişler DHL kapıda ödeme ile alınmaktadır.' },
    { status: 400 }
  );
}
