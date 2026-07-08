import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashOtpCode } from '@/lib/sms/otp';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      phone, 
      code, 
      agreement_version, 
      agreement_title, 
      agreement_body_hash, 
      checkbox_terms_accepted, 
      checkbox_payment_terms_accepted, 
      checkbox_kvkk_notice_read,
      marketing_sms_consent,
      marketing_whatsapp_consent
    } = body;

    if (!phone || !code) {
      return NextResponse.json({ error: 'Telefon numarası veya kod eksik.' }, { status: 400 });
    }

    if (!checkbox_terms_accepted || !checkbox_payment_terms_accepted || !checkbox_kvkk_notice_read) {
      return NextResponse.json({ error: 'Zorunlu alanları onaylamanız gerekmektedir.' }, { status: 400 });
    }

    const normalizedPhone = normalizeTurkishPhoneNumber(phone);
    const otpHash = hashOtpCode(normalizedPhone, code, 'cari_agreement');
    
    // 1. Verify and Consume Token
    const { data: verificationId, error: verifyError } = await supabaseAdmin.rpc('consume_phone_verification_token', {
      p_phone: normalizedPhone,
      p_token_hash: otpHash
    });

    if (verifyError || !verificationId) {
      return NextResponse.json({ error: 'Geçersiz veya süresi dolmuş kod.' }, { status: 400 });
    }

    // 2. Ensure Credit Customer Exists
    let creditCustomerId: string;
    const { data: existingCustomer } = await supabaseAdmin
      .from('credit_customers')
      .select('id')
      .eq('phone_normalized', normalizedPhone)
      .maybeSingle();

    if (existingCustomer) {
      creditCustomerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: createCustError } = await supabaseAdmin
        .from('credit_customers')
        .insert({
          phone: normalizedPhone,
          phone_normalized: normalizedPhone,
          full_name: 'Yeni Cari Müşteri' // Admin can update later
        })
        .select('id')
        .single();
        
      if (createCustError) throw createCustError;
      creditCustomerId = newCustomer.id;
    }

    // 3. Ensure Credit Account Exists
    let creditAccountId: string;
    const { data: existingAccount } = await supabaseAdmin
      .from('credit_accounts')
      .select('id')
      .eq('credit_customer_id', creditCustomerId)
      .maybeSingle();

    if (existingAccount) {
      creditAccountId = existingAccount.id;
    } else {
      // statement_day determination: 
      // 1-9 -> 10, 10-14 -> 15, 15-19 -> 20, 20-24 -> 25, 25+ -> 10
      const currentDay = new Date().getDate();
      let statementDay = 10;
      if (currentDay >= 10 && currentDay <= 14) statementDay = 15;
      else if (currentDay >= 15 && currentDay <= 19) statementDay = 20;
      else if (currentDay >= 20 && currentDay <= 24) statementDay = 25;
      else statementDay = 10;

      const { data: newAccount, error: createAccError } = await supabaseAdmin
        .from('credit_accounts')
        .insert({
          credit_customer_id: creditCustomerId,
          statement_day: statementDay,
          credit_limit: 0 // Default 0 until admin approves
        })
        .select('id')
        .single();
        
      if (createAccError) throw createAccError;
      creditAccountId = newAccount.id;
    }

    // 4. Save Agreement Acceptance Evidence
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { error: insertError } = await supabaseAdmin
      .from('credit_agreement_acceptances')
      .insert({
        credit_customer_id: creditCustomerId,
        credit_account_id: creditAccountId,
        agreement_version,
        agreement_title,
        agreement_body_hash,
        accepted_phone: normalizedPhone,
        otp_verification_id: verificationId,
        ip_address: ip,
        user_agent: userAgent,
        checkbox_terms_accepted,
        checkbox_payment_terms_accepted,
        checkbox_kvkk_notice_read,
        marketing_sms_consent: marketing_sms_consent ?? false,
        marketing_whatsapp_consent: marketing_whatsapp_consent ?? false
      });

    if (insertError) {
      console.error('[CARI ACCEPTANCE DB ERROR]', insertError);
      return NextResponse.json({ error: 'Sözleşme onayı kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Sözleşme başarıyla onaylandı.'
    });

  } catch (error) {
    console.error('[CARI ACCEPTANCE ERROR]', error);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
