import { cookies } from 'next/headers';
import crypto from 'crypto';
import { attributionSupabaseAdmin } from '@/lib/attribution/admin';
import type { Json } from '@/lib/attribution/database.types';

export const COOKIE_NAME = 'hrc_attribution';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function buildEventKey(baseKey: string): string {
  return crypto.createHash('sha256').update(baseKey).digest('hex');
}

export function sanitizeString(input: unknown, maxLength: number): string | null {
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F-\x9F]/.test(str)) return null;
  if (str.length > maxLength) return null;
  return str;
}

export function sanitizeLandingPath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;
  if (str.length > 1000) return null;
  if (!str.startsWith('/')) return null;
  if (str.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\?#\\\s\x00-\x1F\x7F-\x9F]/.test(str)) return null;
  return str;
}

export function sanitizeCampaignCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const str = input.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(str)) return null;
  return str;
}

export function sanitizeReferrer(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (!str || str.length > 2000) return null;
  try {
    const parsed = new URL(str);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const originPath = parsed.origin + parsed.pathname;
    if (originPath.length > 1000) return null;
    return originPath;
  } catch {
    return null;
  }
}

export async function getAttributionSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const { data } = await attributionSupabaseAdmin
      .from('attribution_sessions')
      .select('id')
      .eq('session_token_hash', tokenHash)
      .gt('expires_at', now)
      .single();

    return data?.id ?? null;
  } catch {
    return null;
  }
}

export type FunnelEventType =
  | 'landing_view'
  | 'otp_requested'
  | 'otp_verified'
  | 'application_submitted';

export type FunnelEventProperties = {
  phone_verification_id?: string | null;
  credit_customer_id?: string | null;
  credit_account_id?: string | null;
  agreement_acceptance_id?: string | null;
  metadata?: Record<string, Json>;
};

export async function logFunnelEvent(
  sessionId: string,
  eventType: FunnelEventType,
  eventKey: string,
  properties: FunnelEventProperties = {}
) {
  try {
    const { error } = await attributionSupabaseAdmin.from('funnel_events').insert({
      attribution_session_id: sessionId,
      event_type: eventType,
      event_key: eventKey,
      phone_verification_id: properties.phone_verification_id ?? null,
      credit_customer_id: properties.credit_customer_id ?? null,
      credit_account_id: properties.credit_account_id ?? null,
      agreement_acceptance_id: properties.agreement_acceptance_id ?? null,
      metadata: properties.metadata ?? {},
      occurred_at: new Date().toISOString()
    });

    if (error && error.code !== '23505') {
      console.error('[ATTRIBUTION] Funnel event error', error);
    }
  } catch (err) {
    console.error('[ATTRIBUTION] logFunnelEvent exception', err instanceof Error ? err.message : 'unknown');
  }
}
