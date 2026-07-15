import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAttributionSessionId, logFunnelEvent, buildEventKey } from '@/lib/attribution/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      phone, 
      verificationToken, 
      firstName,
      lastName,
      checkbox_terms_accepted, 
      checkbox_payment_terms_accepted, 
      checkbox_kvkk_notice_read,
      marketing_sms_consent,
      marketing_whatsapp_consent
    } = body;

    if (!phone || !verificationToken) {
      return NextResponse.json({ error: 'Telefon numarası veya doğrulama tokenı eksik.' }, { status: 400 });
    }

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Geçerli bir ad ve soyad girmelisiniz.' }, { status: 400 });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (cleanFirstName.length < 2 || cleanLastName.length < 2) {
      return NextResponse.json({ error: 'Geçerli bir ad ve soyad girmelisiniz.' }, { status: 400 });
    }
    if (cleanFirstName.length > 50 || cleanLastName.length > 50) {
      return NextResponse.json({ error: 'Ad veya soyad çok uzun.' }, { status: 400 });
    }
    const fullName = `${cleanFirstName} ${cleanLastName}`;

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('90') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      cleanPhone = cleanPhone.slice(1);
    }

    if (!/^5\d{9}$/.test(cleanPhone)) {
      return NextResponse.json({ error: 'Telefon numarası 5XXXXXXXXX formatında olmalıdır.' }, { status: 400 });
    }

    const normalizedPhone = normalizeTurkishPhoneNumber(cleanPhone);

    if (!/^[a-f0-9]{64}$/i.test(verificationToken)) {
      return NextResponse.json({ error: 'Doğrulama tokenı geçersiz formatta.' }, { status: 400 });
    }

    if (!checkbox_terms_accepted || !checkbox_payment_terms_accepted || !checkbox_kvkk_notice_read) {
      return NextResponse.json({ error: 'Zorunlu alanları onaylamanız gerekmektedir.' }, { status: 400 });
    }

    // Server-side agreement read
    const agreementVersion = '2026-07-v1';
    const agreementTitle = 'HurCELL Limitli Alışveriş / Cari Hesap Sözleşmesi';
    const filePath = path.join(process.cwd(), 'src', 'content', 'agreements', `limitli-alisveris-${agreementVersion}.md`);
    let agreementBodySnapshot = '';
    
    try {
      agreementBodySnapshot = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error('[CARI ACCEPTANCE] Error reading agreement file:', err);
      return NextResponse.json({ error: 'Sözleşme dosyası okunamadı.' }, { status: 500 });
    }

    const agreementBodyHash = crypto.createHash('sha256').update(agreementBodySnapshot).digest('hex');

    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    
    // 1. Verify and Consume Token
    const { data: verificationId, error: verifyError } = await getSupabaseAdmin().rpc('consume_phone_verification_token', {
      p_phone: normalizedPhone,
      p_token_hash: tokenHash
    });

    if (verifyError || !verificationId) {
      return NextResponse.json({ error: 'Geçersiz veya süresi dolmuş doğrulama isteği.' }, { status: 400 });
    }

    // 2. Ensure Credit Customer Exists
    let creditCustomerId: string;
    let isExistingCustomer = false;
    
    const { data: existingCustomer } = await getSupabaseAdmin().from('credit_customers')
      .select('id, full_name')
      .eq('phone_normalized', normalizedPhone)
      .maybeSingle();

    if (existingCustomer) {
      isExistingCustomer = true;
      creditCustomerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: createCustError } = await getSupabaseAdmin().from('credit_customers')
        .insert({
          phone: normalizedPhone,
          phone_normalized: normalizedPhone,
          full_name: fullName,
          status: 'pending_review'
        })
        .select('id')
        .single();
        
      if (createCustError) throw createCustError;
      creditCustomerId = newCustomer.id;
    }

    // 3. Ensure Credit Account Exists
    let creditAccountId: string;
    const { data: existingAccount } = await getSupabaseAdmin().from('credit_accounts')
      .select('id')
      .eq('credit_customer_id', creditCustomerId)
      .maybeSingle();

    if (existingAccount) {
      creditAccountId = existingAccount.id;
    } else {
      if (isExistingCustomer) {
        // Müşteri var ama hesap yoksa güvenlik gereği yeni açmıyoruz
        return NextResponse.json({ error: 'Cari hesap kaydı bulunamadı. Lütfen HurCELL ile iletişime geçin.' }, { status: 400 });
      }

      // statement_day determination: 
      // 1-9 -> 10, 10-14 -> 15, 15-19 -> 20, 20-24 -> 25, 25+ -> 10
      const currentDay = new Date().getDate();
      let statementDay = 10;
      if (currentDay >= 10 && currentDay <= 14) statementDay = 15;
      else if (currentDay >= 15 && currentDay <= 19) statementDay = 20;
      else if (currentDay >= 20 && currentDay <= 24) statementDay = 25;
      else statementDay = 10;

      const { data: newAccount, error: createAccError } = await getSupabaseAdmin().from('credit_accounts')
        .insert({
          credit_customer_id: creditCustomerId,
          statement_day: statementDay,
          credit_limit: 0,
          status: 'pending_review'
        })
        .select('id')
        .single();
        
      if (createAccError) throw createAccError;
      creditAccountId = newAccount.id;
    }

    // 4. Save Agreement Acceptance Evidence
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { data: newAcceptance, error: insertError } = await getSupabaseAdmin().from('credit_agreement_acceptances')
      .insert({
        credit_customer_id: creditCustomerId,
        credit_account_id: creditAccountId,
        agreement_version: agreementVersion,
        agreement_title: agreementTitle,
        agreement_body_hash: agreementBodyHash,
        agreement_body_snapshot: agreementBodySnapshot,
        accepted_phone: normalizedPhone,
        otp_verification_id: verificationId,
        ip_address: ip,
        user_agent: userAgent,
        checkbox_terms_accepted,
        checkbox_payment_terms_accepted,
        checkbox_kvkk_notice_read,
        marketing_sms_consent: marketing_sms_consent ?? false,
        marketing_whatsapp_consent: marketing_whatsapp_consent ?? false
      })
      .select('id')
      .returns<{ id: string }[]>()
      .single();

    if (insertError) {
      console.error('[CARI ACCEPTANCE DB ERROR]', insertError);
      return NextResponse.json({ error: 'Sözleşme onayı kaydedilemedi.' }, { status: 500 });
    }

    const acceptanceId = newAcceptance?.id;
    if (!acceptanceId) {
      console.error('[CARI ACCEPTANCE DB ERROR] No ID returned');
      return NextResponse.json({ error: 'Sözleşme onayı kaydedilemedi.' }, { status: 500 });
    }

    // Log attribution
    try {
      const sessionId = await getAttributionSessionId();
      if (sessionId) {
        await logFunnelEvent(sessionId, 'application_submitted', buildEventKey(`app_submitted_${acceptanceId}`), {
          phone_verification_id: verificationId,
          credit_customer_id: creditCustomerId,
          credit_account_id: creditAccountId,
          agreement_acceptance_id: acceptanceId
        });
      }
    } catch (err) {
      console.error('[ATTRIBUTION] application_submitted tracking error', err instanceof Error ? err.message : 'unknown');
    }

    return NextResponse.json({ 
      success: true, 
      existingCustomer: isExistingCustomer,
      message: 'Sözleşme başarıyla onaylandı.'
    });

  } catch (error) {
    console.error('[CARI ACCEPTANCE ERROR]', error);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
