import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, companyName, contactName, phone, taxNumber, city, note } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(`Server config missing: SUPABASE_SERVICE_ROLE_KEY`);
      return NextResponse.json(
        { error: 'Sunucu yapılandırma hatası.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let finalEmail = email?.trim();

    if (!finalEmail || !companyName || !contactName || !phone) {
      return NextResponse.json(
        { error: 'E-posta, firma adı, yetkili adı ve telefon zorunludur.' },
        { status: 400 }
      );
    }

    // 1. Check if email already exists in b2b_dealers
    const { data: existingDealer } = await supabaseAdmin
      .from('b2b_dealers')
      .select('id')
      .eq('email', finalEmail)
      .single();

    if (existingDealer) {
      return NextResponse.json(
        { error: 'Bu e-posta adresiyle sistemde zaten bir bayi kaydı bulunuyor.' },
        { status: 400 }
      );
    }

    // 2. Insert into b2b_applications
    const { error: dbError } = await supabaseAdmin.from('b2b_applications').insert([
      {
        email: finalEmail,
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        tax_number: taxNumber?.trim() || null,
        city: city?.trim() || null,
        note: note?.trim() || null,
        status: 'pending',
      },
    ]);

    if (dbError) {
      console.error('--- SUPABASE INSERT ERROR ---');
      console.error('Error code:', dbError.code);
      console.error('Error message:', dbError.message);
      
      if (dbError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Bu e-posta adresiyle bekleyen bir başvurunuz zaten mevcut.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Başvuru kaydedilemedi. Lütfen bilgileri kontrol edip tekrar deneyin.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Başvurunuz alındı. Onaylandıktan sonra giriş yapabilirsiniz.',
    });
  } catch (err: unknown) {
    console.error('B2B register unexpected error:', err);
    return NextResponse.json(
      { error: 'Beklenmedik bir hata oluştu.' },
      { status: 500 }
    );
  }
}
