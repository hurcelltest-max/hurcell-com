import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { attributionSupabaseAdmin } from '@/lib/attribution/admin';
import {
  COOKIE_NAME,
  generateSecureToken,
  hashToken,
  buildEventKey,
  sanitizeLandingPath,
  sanitizeCampaignCode,
  sanitizeReferrer,
  sanitizeString,
  logFunnelEvent
} from '@/lib/attribution/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: true });
    }

    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : (req.headers.get('x-real-ip') || '0.0.0.0');

    // Hash IP for rate limiting
    const rateLimitIdentifier = buildEventKey(`attribution_session_rate_limit:${clientIp}`);

    const { data: limitValid, error: limitError } = await attributionSupabaseAdmin.rpc('check_rate_limit_atomic', {
      p_identifier: rateLimitIdentifier,
      p_action: 'attribution_session',
      p_max_requests: 60,
      p_window_minutes: 10
    });

    if (limitError || !limitValid) {
      return NextResponse.json({ success: true }); // Silent fail
    }

    const landingPath = sanitizeLandingPath(body.landing_path);
    if (!landingPath) {
      return NextResponse.json({ success: true });
    }

    const requestedCampaignCode = sanitizeCampaignCode(body.campaign_code);
    const referrer = sanitizeReferrer(body.referrer);

    const utmSource = sanitizeString(body.utm_source, 100);
    const utmMedium = sanitizeString(body.utm_medium, 100);
    const utmCampaign = sanitizeString(body.utm_campaign, 100);
    const utmContent = sanitizeString(body.utm_content, 255);

    let campaignId = null;
    let acceptedCampaignCode = null;

    if (requestedCampaignCode) {
      const { data: campaign, error: campaignError } = await attributionSupabaseAdmin
        .from('instagram_campaigns')
        .select('id, starts_at, ends_at')
        .eq('campaign_code', requestedCampaignCode)
        .eq('is_active', true)
        .maybeSingle();

      if (!campaignError && campaign) {
        const nowMs = Date.now();
        const startMs = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
        const endMs = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;

        const isStarted = startMs === null || nowMs >= startMs;
        const isEnded = endMs !== null && nowMs >= endMs;

        if (isStarted && !isEnded) {
          campaignId = campaign.id;
          acceptedCampaignCode = requestedCampaignCode;
        }
      }
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    const now = new Date().toISOString();

    let sessionId = null;
    let tokenHash = null;

    if (token && /^[a-f0-9]{64}$/.test(token)) {
      tokenHash = hashToken(token);
      const { data: existingSession } = await attributionSupabaseAdmin
        .from('attribution_sessions')
        .select('id, expires_at')
        .eq('session_token_hash', tokenHash)
        .single();

      if (existingSession && new Date(existingSession.expires_at).getTime() > new Date().getTime()) {
        sessionId = existingSession.id;
        try {
          await attributionSupabaseAdmin
            .from('attribution_sessions')
            .update({ last_seen_at: now })
            .eq('id', sessionId);
        } catch {
          // Ignore last_seen_at update errors
        }
      }
    }

    if (!sessionId) {
      const newToken = generateSecureToken();
      tokenHash = hashToken(newToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data: newSession, error: insertError } = await attributionSupabaseAdmin
        .from('attribution_sessions')
        .insert({
          session_token_hash: tokenHash,
          campaign_id: campaignId,
          campaign_code: acceptedCampaignCode,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          referrer: referrer,
          landing_path: landingPath,
          first_seen_at: now,
          last_seen_at: now,
          expires_at: expiresAt.toISOString()
        })
        .select('id')
        .returns<{ id: string }[]>()
        .single();

      if (insertError || !newSession?.id) {
        return NextResponse.json({ success: true });
      }

      sessionId = newSession.id;

      cookieStore.set(COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/'
      });
    }

    if (sessionId) {
      const eventKey = buildEventKey(`landing_view:${sessionId}`);
      await logFunnelEvent(sessionId, 'landing_view', eventKey);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
