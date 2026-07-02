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

    // 1. Get the application
    const { data: application, error: appError } = await supabaseAdmin
      .from('b2b_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json({ error: 'Başvuru bulunamadı.' }, { status: 404 });
    }

    if (application.status !== 'pending') {
      return NextResponse.json({ error: 'Bu başvuru zaten işlenmiş.' }, { status: 400 });
    }

    // 2. Check if auth user exists, if not create and invite
    let userId;
    const { data: existingUsers, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === application.email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(application.email);
      if (inviteError) {
        return NextResponse.json({ error: 'Kullanıcı daveti gönderilemedi: ' + inviteError.message }, { status: 500 });
      }
      userId = inviteData.user?.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Kullanıcı kimliği alınamadı.' }, { status: 500 });
    }

    // 3. Insert into b2b_dealers
    const { error: dealerError } = await supabaseAdmin.from('b2b_dealers').insert([{
      user_id: userId,
      email: application.email,
      company_name: application.company_name,
      contact_name: application.contact_name,
      phone: application.phone,
      tax_number: application.tax_number,
      city: application.city,
      note: application.note,
      status: 'approved'
    }]);

    if (dealerError) {
      // If error is unique violation, it might already exist, which is fine, but we should handle it
      if (dealerError.code !== '23505') {
        return NextResponse.json({ error: 'Bayi kaydı oluşturulamadı: ' + dealerError.message }, { status: 500 });
      }
    }

    // 4. Update application status
    const { error: updateError } = await supabaseAdmin
      .from('b2b_applications')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Failed to update application status:', updateError);
    }

    return NextResponse.json({ message: 'Başvuru onaylandı ve kullanıcıya davet gönderildi.' });
  } catch (err: any) {
    console.error('Approve application error:', err);
    return NextResponse.json({ error: 'Beklenmedik bir hata oluştu.' }, { status: 500 });
  }
}
