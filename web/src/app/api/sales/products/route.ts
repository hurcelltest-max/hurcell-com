import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''

    const supabase = createSupabaseAdminClient()

    let query = supabase
      .from('products')
      .select('id, name, category, brand, sell_price, barcode, stock, description, image_url')

    if (q.trim()) {
      query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    }

    const { data, error } = await query.limit(20)

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, products: data || [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ürünler getirilirken hata oluştu.'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
