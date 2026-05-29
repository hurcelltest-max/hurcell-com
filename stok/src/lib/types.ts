export type Product = {
  id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  stock: number;
  buy_price: number;
  sell_price: number;
  min_stock: number;
  location: string | null;
  created_at: string;
  description: string | null;
  image_url: string | null;
  is_web_visible: boolean;
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
}

export interface Database {
  public: {
    Tables: SupabaseTableDefinitions;
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
