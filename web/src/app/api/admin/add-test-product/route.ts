import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    // idempotent: check by unique name
    const name = body.name || 'HurCELL Premium Lansman Kılıfı'

    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('name', name)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, message: 'Test product already exists' })
    }

    const product: any = {
      name,
      category: body.category || 'Aksesuarlar',
      price: body.price || 450,
      description: body.description || 'Dinamik veri tabanı testi için eklenmiş premium kılıf.',
      sku: body.sku || 'TEST-HURCELL-0001',
      image_url: body.image_url || '/images/placeholder.png',
      created_at: new Date().toISOString(),
    }

    const { error } = await supabaseAdmin.from('products').insert(product)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Test product inserted' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}
