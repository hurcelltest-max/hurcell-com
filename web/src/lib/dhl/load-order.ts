import { supabaseAdmin } from '../supabase/admin';
import { Order } from './types';

export async function loadOrder(orderId: string): Promise<Order | null> {
  if (!orderId) {
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, customer_email, shipping_city, shipping_district, shipping_address, shipping_address_line, payment_method, total_amount')
      .eq('id', orderId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as unknown as Order;
  } catch {
    return null;
  }
}
