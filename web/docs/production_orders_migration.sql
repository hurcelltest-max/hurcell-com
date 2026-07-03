-- Migration file for creating orders and order_items tables in production
-- File: docs/production_orders_migration.sql

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number text UNIQUE NOT NULL DEFAULT ('HR' || upper(substring(gen_random_uuid()::text, 1, 8))),
    lookup_token text NOT NULL DEFAULT gen_random_uuid()::text,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    billing_address text NOT NULL,
    shipping_address text NOT NULL,
    subtotal_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    shipping_fee numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    campaign_summary jsonb DEFAULT '[]'::jsonb,
    currency text DEFAULT 'TRY',
    status text DEFAULT 'pending',
    payment_method text DEFAULT 'cash_on_delivery',
    payment_provider text,
    payment_status text DEFAULT 'pending_on_delivery',
    shipping_provider text,
    shipping_status text DEFAULT 'pending',
    dhl_status text,
    shipping_address_line text,
    shipping_city text,
    shipping_district text,
    shipping_postal_code text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    product_title_snapshot text NOT NULL,
    barcode_snapshot text,
    unit_price_snapshot numeric NOT NULL,
    original_unit_price_snapshot numeric,
    discount_amount_snapshot numeric DEFAULT 0,
    final_unit_price_snapshot numeric NOT NULL,
    applied_campaign_id uuid,
    applied_campaign_name_snapshot text,
    quantity integer NOT NULL DEFAULT 1,
    line_total numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);
