import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    let updatedFields: any = { status, updated_at: new Date().toISOString() }

    // 2. Handle Restock
    if (requiresRestock) {
      if (!order.stock_reserved_at) {
        // Stock was never reserved, no need to restock, but we will allow the status change.
        updatedFields.stock_release_reason = status + ' (No prior reservation)'
      } else if (order.stock_released_at) {
        // Stock already released, don't double restock.
        updatedFields.stock_release_reason = status + ' (Already released)'
      } else {
        // 3. Needs restock. Fetch items.
        const { data: items, error: itemsError } = await supabaseAdmin
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', order.id)
        
        if (itemsError) {
          console.error('Error fetching order items for restock:', itemsError)
          return NextResponse.json({ error: 'Stok iadesi için sipariş kalemleri okunamadı.' }, { status: 500 })
        }

        let restockFailed = false;
        
        for (const item of items || []) {
          if (!item.product_id || item.quantity <= 0) continue;
          
          const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('increment_product_stock_safe', {
            p_product_id: item.product_id,
            p_qty: item.quantity
          })

          if (rpcError || !rpcData || !rpcData[0] || !rpcData[0].success) {
            console.error('Stock restock failed for item:', item.product_id, rpcError || rpcData)
            restockFailed = true;
            break;
          }
        }

        if (restockFailed) {
          return NextResponse.json({ error: 'Stok iade işlemi başarısız oldu. Sipariş durumu güncellenmedi.' }, { status: 500 })
        }

        updatedFields.stock_released_at = new Date().toISOString()
        updatedFields.stock_release_reason = status
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
