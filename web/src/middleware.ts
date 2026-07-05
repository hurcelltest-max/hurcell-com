import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const authHeader = req.headers.get('authorization')
    const username = process.env.ADMIN_USERNAME
    const password = process.env.ADMIN_PASSWORD

    if (!username || !password) {
      console.error('Missing ADMIN_USERNAME or ADMIN_PASSWORD in environment variables.')
      return new NextResponse('Authentication is not configured.', { 
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="HurCELL Admin"' }
      })
    }

    if (!authHeader) {
      return new NextResponse('Authentication required.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="HurCELL Admin"' }
      })
    }

    const authValue = authHeader.split(' ')[1]
    const [reqUsername, reqPassword] = Buffer.from(authValue, 'base64').toString().split(':')

    if (reqUsername !== username || reqPassword !== password) {
      return new NextResponse('Invalid credentials.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="HurCELL Admin"' }
      })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
