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
    await supabaseAdmin
      .from('phone_verifications')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);

    // 4. Verify Code
    const isValid = verifyOtpCode(normalizedPhone, code, record.otp_hash, 'checkout');
    
    if (!isValid) {
      return NextResponse.json({ error: 'Hatalı kod girdiniz.' }, { status: 400 });
    }

    // 5. Code is valid. Generate verification token.
    const rawToken = crypto.randomBytes(32).toString('hex');
    // We hash the token in DB so if DB is leaked, attackers cannot reuse tokens
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await supabaseAdmin
      .from('phone_verifications')
      .update({
        verified_at: new Date().toISOString(),
        verification_token_hash: tokenHash
      })
      .eq('id', record.id);

    return NextResponse.json({ 
      success: true, 
      verificationToken: rawToken // Return raw token to frontend 
    });

  } catch (err: unknown) {
    console.error('[VERIFY OTP ERROR]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'OTP doğrulanamadı.' }, { status: 500 });
  }
}
