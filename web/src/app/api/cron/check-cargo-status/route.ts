import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { mockFetchCargoStatus, cargoStatusMapper } from '@/lib/cargo/mapper';
import { releaseOrderStock } from '@/lib/orders/stock';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get('secret');

  // Verify CRON_SECRET
  if (
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    secretParam !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 0. Safety Check for CARGO_POLLING_ENABLED
    if (process.env.CARGO_POLLING_ENABLED !== 'true') {
      return NextResponse.json({ success: true, message: 'Cargo polling is disabled via CARGO_POLLING_ENABLED flag.' });
    }

    // 1. Fetch shipped orders that haven't been delivered or failed yet
    const { data: orders, error } = await getSupabaseAdmin().from('orders')
      .select('id, tracking_number, shipping_status, stock_released_at')
      .eq('shipping_status', 'shipped')
      .not('tracking_number', 'is', null);

    if (error) {
      console.error('Error fetching shipped orders:', error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const results = [];

    for (const order of orders || []) {
      // 2. Fetch external status
      // MOCK SAFETY: Do not use mock adapter in production unless explicitly bypassed (we shouldn't bypass)
      let externalStatus = 'taşıma halinde';
      let payload = { code: 'PENDING', msg: 'Awaiting real DHL API integration' };

      const isProduction = process.env.VERCEL_ENV === 'production';
      const isPreview = process.env.VERCEL_ENV === 'preview';
      const isLocal = process.env.NODE_ENV === 'development';
      const allowMockCargo = isLocal || isPreview;

      if (allowMockCargo && !isProduction) {
        const mockResult = await mockFetchCargoStatus(order.tracking_number!);
        externalStatus = mockResult.status;
        payload = mockResult.payload;
      } else {
        // In production, we should call the REAL DHL/MNG API here.
        // For now, it's a no-op that leaves the status as shipped.
        console.warn(`Production DHL API not integrated yet. Order ${order.tracking_number} skipping update.`);
      }
      
      // 3. Map to internal status
      const internalStatus = cargoStatusMapper(externalStatus);
      
      let updatePayload: any = {
        last_cargo_status_checked_at: new Date().toISOString(),
        last_cargo_status_payload: payload,
      };

      let stockReleased = false;

      // 4. Handle Status Transitions
      if (internalStatus !== order.shipping_status) {
        updatePayload.shipping_status = internalStatus;
        
        if (internalStatus === 'delivered') {
          updatePayload.delivered_at = new Date().toISOString();
        } else if (
          ['delivery_failed', 'not_delivered', 'customer_refused', 'returned'].includes(internalStatus)
        ) {
          // Stock needs to be released
          if (!order.stock_released_at) {
            const releaseResult = await releaseOrderStock(order.id, `cargo_${internalStatus}`);
            if (releaseResult.success) {
              stockReleased = true;
              // Note: releaseOrderStock updates stock_released_at in DB
              // So we don't need to overwrite it in updatePayload, but we update status
            } else {
              console.error(`Failed to release stock for ${order.id}:`, releaseResult.message);
            }
          }
        }
      }

      // 5. Update Order
      const { error: updateError } = await getSupabaseAdmin().from('orders')
        .update(updatePayload)
        .eq('id', order.id);

      results.push({
        order_id: order.id,
        tracking_number: order.tracking_number,
        old_status: order.shipping_status,
        new_status: internalStatus,
        stock_released: stockReleased,
        update_error: updateError ? updateError.message : null
      });
    }

    return NextResponse.json({ success: true, processed: orders?.length || 0, results });

  } catch (err: any) {
    console.error('CRON Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
