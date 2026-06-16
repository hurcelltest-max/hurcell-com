export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string;
  image_url_2?: string | null;
  image_url_3?: string | null;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  memory?: string | null;
  ram?: string | null;
  storage?: string | null;
  processor?: string | null;
  screen_size?: string | null;
  device_condition_type?: string | null;
  device_category?: string | null;
  imei_1?: string | null;
  imei_2?: string | null;
  serial_number?: string | null;
  battery_health?: string | null;
  box_status?: string | null;
  warranty_status?: string | null;
  supplier_name?: string | null;
  supplier_invoice_no?: string | null;
  service_report_no?: string | null;
  device_metadata?: any | null;
  sell_price?: number | null;
  barcode?: string | null;
  is_web_visible?: boolean | null;
  location?: string | null;
  is_slider_visible?: boolean | null;
  is_campaign?: boolean | null;
  campaign_title?: string | null;
  campaign_benefit?: string | null;
  show_campaign_benefit_in_slider?: boolean | null;
  campaign_benefit_requires_return?: boolean | null;
  is_discounted?: boolean | null;
  old_price?: number | null;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

export interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
  iyzico_token?: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
}
