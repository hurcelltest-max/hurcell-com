import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateOtpCode, hashOtpCode } from '@/lib/sms/otp';
import { normalizeTurkishPhoneNumber } from '@/lib/sms/phone';
import { getSmsProvider } from '@/lib/sms/mock-provider';
import { maskPhone } from '@/lib/sms/netgsm-provider';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: 'Telefon numarası eksik.' }, { status: 400 });
    }

    const normalizedPhone = normalizeTurkishPhoneNumber(phone);
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // 1. Check Rate Limit (IP) using atomic RPC
    const { data: ipLimitValid, error: ipError } = await getSupabaseAdmin().rpc('check_rate_limit_atomic', {
      p_identifier: ip,
      p_action: 'send_otp',
      p_max_requests: 5,
      p_window_minutes: 10
    });

    if (ipError || ipLimitValid === false) {
      return NextResponse.json({ error: 'Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin.' }, { status: 429 });
    }

    // Check Rate Limit (Phone) using atomic RPC
    const { data: phoneLimitValid, error: phoneError } = await getSupabaseAdmin().rpc('check_rate_limit_atomic', {
      p_identifier: normalizedPhone,
      p_action: 'send_otp',
      p_max_requests: 3,
      p_window_minutes: 10
    });

    if (phoneError || phoneLimitValid === false) {
      return NextResponse.json({ error: 'Bu numara için çok fazla istek gönderildi.' }, { status: 429 });
    }

    // 2. Generate and Store OTP
    const code = generateOtpCode();
    const otpHash = hashOtpCode(normalizedPhone, code, 'checkout');
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 mins

    const userAgent = req.headers.get('user-agent') || '';
    const userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');

    const { error: insertError } = await supabaseAdmin
      .from('phone_verifications')
      .insert({
        phone: normalizedPhone,
        otp_hash: otpHash,
        expires_at: expiresAt,
        ip_address: ip,
        user_agent_hash: userAgentHash
      });

    if (insertError) {
      throw insertError;
    }

    // 3. Send SMS
    const provider = getSmsProvider();
    const message = `HurCELL Kapida Odeme Dogrulama Kodunuz: ${code}. Bu kod 3 dakika gecerlidir.`;
    const smsResult = await provider.sendSms(normalizedPhone, message);

    if (!smsResult.success) {
      console.error(
        `[SEND OTP PROVIDER FAILED] To: ${maskPhone(normalizedPhone)} | Error: ${smsResult.error || 'Unknown provider failure'}`
      );

      return NextResponse.json(
        { error: 'SMS gönderilemedi. Lütfen biraz sonra tekrar deneyin.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: 'Doğrulama kodu gönderildi.' });

  } catch (err: unknown) {
    console.error('[SEND OTP ERROR]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'OTP gönderilemedi.' }, { status: 500 });
  }
}
