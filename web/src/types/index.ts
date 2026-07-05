export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  image_url: string;
  created_at: string;
  updated_at?: string;
  brand?: string | null;
  sku?: string | null;
  
  // Missing DB columns, kept for TS compatibility
  model?: string | null;
  color?: string | null;
  memory?: string | null;
  ram?: string | null;
  storage?: string | null;
  processor?: string | null;
  screen_size?: string | null;
  device_condition_type?: string | null;
  is_campaign?: boolean | null;
  campaign_title?: string | null;
  campaign_benefit?: string | null;
  show_campaign_benefit_in_slider?: boolean | null;
  is_discounted?: boolean | null;
  old_price?: number | null;
  
  // Frontend Mapped Columns
  sell_price?: number | null;
  barcode?: string | null;
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
  status: 'pending' | 'paid' | 'shipped' | 'cancelled' | string;
  iyzico_token?: string;
  created_at: string;

  // Stock tracking
  stock_reserved_at?: string | null;
  stock_released_at?: string | null;
  stock_release_reason?: string | null;

  // Cargo tracking
  tracking_number?: string | null;
  shipment_barcode?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cargo_company?: string | null;
  last_cargo_status_checked_at?: string | null;
  last_cargo_status_payload?: Record<string, unknown> | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
}
