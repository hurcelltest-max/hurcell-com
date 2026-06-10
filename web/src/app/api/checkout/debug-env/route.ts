import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  return NextResponse.json({
    supabase_url_exists: !!url,
    supabase_url_length: url.length,
    key_exists: !!key,
    key_length: key.length,
    key_prefix: key.slice(0, 5),
    key_is_none: key === 'none',
  });
}
