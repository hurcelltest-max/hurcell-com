import { NextResponse } from 'next/server';
import { getVerifiedAdminUsername } from './auth';

export type RequireAdminApiResult =
  | { ok: true; username: string; response: null }
  | { ok: false; username: null; response: NextResponse };

export function requireAdminApi(req: Request): RequireAdminApiResult {
  const username = getVerifiedAdminUsername(req);
  if (!username) {
    const response = NextResponse.json(
      { error: 'Yetkisiz erişim veya kimlik doğrulama hatası.' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="HurCELL Admin"',
          'Cache-Control': 'no-store'
        }
      }
    );
    return { ok: false, username: null, response };
  }
  return { ok: true, username, response: null };
}
