export type Product = {
  id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  stock: number;
  buy_price: number;
  sell_price: number;
  buy_currency: string;
  foreign_buy_price: number | null;
  min_stock: number;
  location: string | null;
  created_at: string;
  description: string | null;
  image_url: string | null;
  image_url_2?: string | null;
  image_url_3?: string | null;
  is_web_visible: boolean;
  is_b2b_visible: boolean;
  is_slider_visible?: boolean | null;
  is_campaign?: boolean | null;
  campaign_title?: string | null;
  campaign_benefit?: string | null;
  show_campaign_benefit_in_slider?: boolean | null;
  campaign_benefit_requires_return?: boolean | null;
  is_discounted?: boolean | null;
  old_price?: number | null;
  b2b_package_title?: string | null;
  b2b_package_description?: string | null;
  b2b_min_quantity?: number | null;
  b2b_package_price?: number | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  memory: string | null;
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
};

export type StockMovementType = 'IN' | 'OUT' | 'RETURN' | 'ADJUSTMENT';

export type StockMovement = {
  id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity: number;
  note: string | null;
  created_at: string;
};

export type Sale = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
};

export type AdminUser = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  is_active?: boolean;
  created_at: string;
};

export type B2bDealer = {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string;
  tax_number: string | null;
  city: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'passive';
  created_at: string;
  updated_at: string;
};

export type BatchStatus = 'completed' | 'rolled_back' | 'failed';

export type BatchActionType = 'markup' | 'margin' | 'flat_increase' | 'flat_decrease' | 'percent_increase' | 'percent_decrease' | 'currency_update';

export type PriceUpdateBatch = {
  id: string;
  admin_user_id: string;
  action_type: BatchActionType;
  parameters: any;
  status: BatchStatus;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  created_at: string;
};

export type PriceUpdateItem = {
  id: string;
  batch_id: string;
  product_id: string;
  old_buy_currency: string;
  old_foreign_buy_price: number | null;
  old_buy_price: number;
  old_sell_price: number;
  new_buy_currency: string;
  new_foreign_buy_price: number | null;
  new_buy_price: number;
  new_sell_price: number;
};

export interface SupabaseTableDefinitions {
  products: {
    Row: Product;
    Insert: Omit<Product, 'id' | 'created_at'>;
    Update: Partial<Omit<Product, 'id' | 'created_at'>>;
    Relationships: [];
  };
  stock_movements: {
    Row: StockMovement;
    Insert: Omit<StockMovement, 'id' | 'created_at'>;
    Update: Partial<Omit<StockMovement, 'id' | 'created_at'>>;
    Relationships: [];
  };
  sales: {
    Row: Sale;
    Insert: Omit<Sale, 'id' | 'created_at'>;
    Update: Partial<Omit<Sale, 'id' | 'created_at'>>;
    Relationships: [];
  };
  admin_users: {
    Row: AdminUser;
    Insert: Omit<AdminUser, 'id' | 'created_at'>;
    Update: Partial<Omit<AdminUser, 'id' | 'created_at'>>;
    Relationships: [];
  };
  b2b_dealers: {
    Row: B2bDealer;
    Insert: Omit<B2bDealer, 'id' | 'created_at' | 'updated_at'>;
    Update: Partial<Omit<B2bDealer, 'id' | 'created_at' | 'updated_at'>>;
    Relationships: [];
  };
  price_update_batches: {
    Row: PriceUpdateBatch;
    Insert: Omit<PriceUpdateBatch, 'id' | 'created_at'>;
    Update: Partial<Omit<PriceUpdateBatch, 'id' | 'created_at'>>;
    Relationships: [];
  };
  price_update_items: {
    Row: PriceUpdateItem;
    Insert: Omit<PriceUpdateItem, 'id'>;
    Update: Partial<Omit<PriceUpdateItem, 'id'>>;
    Relationships: [];
  };
}

export interface Database {
  public: {
    Tables: SupabaseTableDefinitions;
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
