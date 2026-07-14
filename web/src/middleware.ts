import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyBasicAuthHeader } from './lib/admin/auth'

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/sales') ||
    pathname.startsWith('/api/dhl') ||
    pathname.startsWith('/cihaz-kabul-protokolu')
  ) {
    const authHeader = req.headers.get('authorization')
    const username = process.env.ADMIN_USERNAME
    const password = process.env.ADMIN_PASSWORD

    const isAuthorized = verifyBasicAuthHeader(authHeader, username, password)

    if (!isAuthorized) {
      if (!username || !password) {
        console.error('[AUTH_FAILED] code: CONFIG_MISSING')
      } else {
        console.error('[AUTH_FAILED] code: 401')
      }

      return new NextResponse(
        JSON.stringify({ error: 'Yetkisiz erişim veya kimlik doğrulama hatası.' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Basic realm="HurCELL Admin"',
            'Cache-Control': 'no-store'
          }
        }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/sales/:path*',
    '/api/dhl/:path*',
    '/cihaz-kabul-protokolu/:path*',
    '/cihaz-kabul-protokolu'
  ],
}
