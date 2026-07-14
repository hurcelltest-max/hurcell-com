import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/admin/require-admin-api'

export async function GET(request: Request) {
  try {
    const auth = requireAdminApi(request)
    if (!auth.ok) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''

    const supabase = createSupabaseAdminClient()

    let query = supabase
      .from('products')
      .select('id, name, category, brand, price, sku, stock, description, image_url')

    if (q.trim()) {
      query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    }

    const { data, error } = await query.limit(20)

    if (error) {
      console.error('[PRODUCTS LOOKUP ERROR]', error)
      const response = NextResponse.json({ ok: false, message: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 })
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    const mappedData = (data || []).map(p => ({ ...p, sell_price: p.price, barcode: p.sku }))
    const response = NextResponse.json({ ok: true, products: mappedData })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[PRODUCTS LOOKUP EXCEPTION]', message)
    const response = NextResponse.json({ ok: false, message: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
