import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyOtpCode } from '@/lib/sms/otp';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { phone, code } = await req.json();
    if (!phone || !code) {
      return NextResponse.json({ error: 'Telefon numarası veya kod eksik.' }, { status: 400 });
    }

    const normalizedPhone = normalizeTurkishPhoneNumber(phone);

    if (!/^5\d{9}$/.test(normalizedPhone)) {
      return NextResponse.json({ error: 'Telefon numarası 5XXXXXXXXX formatında olmalıdır.' }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Doğrulama kodu 6 haneli olmalıdır.' }, { status: 400 });
    }

    // 1. Get the latest unverified OTP for this phone
    const { data: record, error: fetchError } = await supabaseAdmin
      .from('phone_verifications')
      .select('*')
      .eq('phone', normalizedPhone)
      .is('verified_at', null)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: 'Geçerli bir doğrulama kodu bulunamadı. Lütfen yeni kod isteyin.' }, { status: 400 });
    }

    // 2. Check Expiration
    if (new Date() > new Date(record.expires_at)) {
      return NextResponse.json({ error: 'Bu kodun süresi dolmuş. Lütfen yeni kod isteyin.' }, { status: 400 });
    }

    // 3. Check Attempts
    if (record.attempts >= 3) {
      return NextResponse.json({ error: 'Çok fazla hatalı deneme yaptınız. Lütfen yeni kod isteyin.' }, { status: 400 });
    }

    // Increment attempts
    const { error: attemptError } = await supabaseAdmin
      .from('phone_verifications')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);

    if (attemptError) {
      console.error('[CARI VERIFY OTP ERROR] Failed to increment attempts:', attemptError);
      return NextResponse.json({ error: 'Sistem hatası oluştu. Lütfen tekrar deneyin.' }, { status: 500 });
    }

    // 4. Verify Code
    const isValid = verifyOtpCode(normalizedPhone, code, record.otp_hash, 'cari_agreement');
    
    if (!isValid) {
      return NextResponse.json({ error: 'Hatalı kod girdiniz.' }, { status: 400 });
    }

    // 5. Code is valid. Generate verification token.
    const rawToken = crypto.randomBytes(32).toString('hex');
    // We hash the token in DB so if DB is leaked, attackers cannot reuse tokens
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const { error: updateError } = await supabaseAdmin
      .from('phone_verifications')
      .update({
        verified_at: new Date().toISOString(),
        verification_token_hash: tokenHash
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('[CARI VERIFY OTP ERROR] Failed to update verification token:', updateError);
      return NextResponse.json({ error: 'Doğrulama kaydedilemedi. Lütfen tekrar deneyin.' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      verificationToken: rawToken // Return raw token to frontend 
    });

  } catch (err: unknown) {
    console.error('[CARI VERIFY OTP ERROR]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'OTP doğrulanamadı.' }, { status: 500 });
  }
}
