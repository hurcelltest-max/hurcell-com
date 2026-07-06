import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const sku = 'TEST-HURCELL-ORDER-001'
    const name = 'HurCELL Test Ürünü - Sipariş Denemesi'
    const category = 'Aksesuar'
    const price = 100
    const stock = 10
    const image_url = '/images/placeholder.svg'
    const description = 'HurCELL sipariş ve OTP testleri için geçici test ürünü.'

    // Check if test product exists by SKU
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('sku', sku)
      .limit(1)

    if (existing && existing.length > 0) {
      // Update existing test product
      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({
          name,
          stock,
          price,
          image_url,
          category,
          description
        })
        .eq('sku', sku)

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        created: false,
        updated: true,
        product: { id: existing[0].id, name, stock, price }
      })
    }

    // Insert new test product
    const product: any = {
      name,
      category,
      price,
      stock,
      description,
      sku,
      image_url,
      created_at: new Date().toISOString()
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('products')
      .insert(product)
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      created: true,
      updated: false,
      product: { id: inserted?.id, name, stock, price }
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 })
  }
}
