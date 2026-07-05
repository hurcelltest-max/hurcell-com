-- 20260705000000_cargo_tracking.sql
-- Add cargo tracking fields to orders table

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_number text,
ADD COLUMN IF NOT EXISTS shipment_barcode text,
ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS cargo_company text,
ADD COLUMN IF NOT EXISTS last_cargo_status_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS last_cargo_status_payload jsonb,
ADD COLUMN IF NOT EXISTS stock_released_at timestamptz,
ADD COLUMN IF NOT EXISTS stock_release_reason text;
