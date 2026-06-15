import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  return NextResponse.json(
    { error: 'Online ödeme devre dışı. Siparişler DHL kapıda ödeme ile alınmaktadır.' },
    { status: 400 }
  );
}
