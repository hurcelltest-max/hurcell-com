-- Supabase Migration: Add discount fields to products table
-- Path: supabase/migrations/20260616145000_add_discount_fields.sql

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_discounted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS old_price NUMERIC(10, 2);

-- Yorumlar
COMMENT ON COLUMN public.products.is_discounted IS 'Ürün indirimde mi? (true/false)';
COMMENT ON COLUMN public.products.old_price IS 'İndirimli ürünler için eski fiyat (çizili olarak gösterilecek)';
