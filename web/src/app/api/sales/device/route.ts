import { NextResponse } from 'next/server'
import { deviceSaleSchema } from '@/lib/sales/schema'
import { buildDeviceSaleContractText } from '@/lib/sales/contract-template'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

function createSaleCode() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `HRC-${date}-${random}`
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const parsed = deviceSaleSchema.safeParse(payload)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Satış formunda eksik veya hatalı alanlar var.', errors: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const input = parsed.data
    const supabase = createSupabaseAdminClient()
    const saleCode = createSaleCode()
    const contractText = buildDeviceSaleContractText(input, saleCode)

    const { data, error } = await supabase.rpc('complete_device_sale', {
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_sale_code: saleCode,
      p_channel: input.channel,
      p_customer: input.customer,
      p_device: input.device,
      p_cosmetic: input.cosmetic,
      p_tests: input.tests,
      p_known_issues: input.knownIssues,
      p_included_items: input.includedItems,
      p_customer_declaration: input.customerDeclaration,
      p_contract_text: contractText,
      p_signature_data_url: input.signatureDataUrl || null,
      p_sale_price: input.salePrice ?? null,
    })

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message || 'Satış kaydı oluşturulamadı.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true, saleCode, sale: data, contractText })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata oluştu.'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
