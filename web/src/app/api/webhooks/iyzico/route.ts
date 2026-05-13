import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        
        // In Sandbox, Iyzico sends payment updates
        // status: SUCCESS, token: ..., etc.
        const { status, paymentId, conversationId } = payload;

        if (status !== 'SUCCESS') {
            return NextResponse.json({ received: true });
        }

        // 1. Find the order by conversationId (which we passed during initialization)
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, status')
            .eq('iyzico_token', conversationId)
            .single();

        if (orderError || !order) {
            console.error('Order not found:', conversationId);
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        if (order.status === 'paid') {
            return NextResponse.json({ message: 'Order already processed' });
        }

        // 2. Update order status
        await supabaseAdmin
            .from('orders')
            .update({ status: 'paid', metadata: { iyzico_payment_id: paymentId } })
            .eq('id', order.id);

        // 3. Get order items
        const { data: items, error: itemsError } = await supabaseAdmin
            .from('order_items')
            .select('product_id, quantity')
            .eq('order_id', order.id);

        if (itemsError) throw itemsError;

        // 4. Decrement Stock (Stok Düşme Mantığı)
        // Note: For production, use an RPC function for atomic updates
        for (const item of items) {
            const { error: stockError } = await supabaseAdmin.rpc('decrement_stock', {
                row_id: item.product_id,
                amount: item.quantity
            });

            // Fallback if RPC doesn't exist (basic update)
            if (stockError) {
                const { data: product } = await supabaseAdmin
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .single();
                
                if (product) {
                    await supabaseAdmin
                        .from('products')
                        .update({ stock: Math.max(0, product.stock - item.quantity) })
                        .eq('id', item.product_id);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Webhook Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
