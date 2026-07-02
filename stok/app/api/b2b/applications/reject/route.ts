import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { applicationId } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error: updateError } = await supabaseAdmin
      .from('b2b_applications')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', applicationId);

    if (updateError) {
      return NextResponse.json({ error: 'Başvuru reddedilemedi: ' + updateError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Başvuru başarıyla reddedildi.' });
  } catch (err: any) {
    console.error('Reject application error:', err);
    return NextResponse.json({ error: 'Beklenmedik bir hata oluştu.' }, { status: 500 });
  }
}
