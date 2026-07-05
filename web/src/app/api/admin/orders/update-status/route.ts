import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { releaseOrderStock } from '@/lib/orders/stock'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { order_id, order_number, status } = body

    if (!status || (!order_id && !order_number)) {
      return NextResponse.json({ error: 'Eksik parametreler (status ve order_id/order_number zorunludur).' }, { status: 400 })
    }

    const validStatuses = [
      'pending', 'confirmed', 'preparing', 'shipped', 'delivered', 
      'cancelled', 'returned', 'delivery_failed', 'not_delivered', 'customer_refused'
    ]

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Geçersiz statü değeri.' }, { status: 400 })
    }

    const restockStatuses = ['cancelled', 'returned', 'delivery_failed', 'not_delivered', 'customer_refused']
    const requiresRestock = restockStatuses.includes(status)

    // 1. Fetch order
    let query = supabaseAdmin.from('orders').select('*')
    if (order_id) query = query.eq('id', order_id)
    else query = query.eq('order_number', order_number)

    const { data: order, error: orderError } = await query.single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 })
    }

    // 2. Prevent manual cancellation if already shipped
    if (requiresRestock && ['shipped', 'delivered'].includes(order.shipping_status)) {
      return NextResponse.json({ error: 'Kargoya verilmiş siparişlerde manuel iade/iptal işlemi yapılamaz.' }, { status: 400 })
    }

    let updatedFields: any = { status, updated_at: new Date().toISOString() }

    // 3. Handle Restock
    if (requiresRestock) {
      if (!order.stock_reserved_at) {
        updatedFields.stock_release_reason = status + ' (No prior reservation)'
      } else if (order.stock_released_at) {
        updatedFields.stock_release_reason = status + ' (Already released)'
      } else {
        const releaseResult = await releaseOrderStock(order.id, `admin_${status}`)
        if (!releaseResult.success) {
          return NextResponse.json({ error: releaseResult.message }, { status: 500 })
        }
        // stock_released_at is already updated by releaseOrderStock, 
        // but we can just leave it to the DB or skip re-updating here.
      }
    }

    // 4. Update Order
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updatedFields)
      .eq('id', order.id)

    if (updateError) {
      console.error('Error updating order status:', updateError)
      return NextResponse.json({ error: 'Sipariş durumu güncellenirken hata oluştu.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Sipariş başarıyla güncellendi.', status: updatedFields })

  } catch (err: any) {
    console.error('Update order status error:', err)
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 })
  }
}
