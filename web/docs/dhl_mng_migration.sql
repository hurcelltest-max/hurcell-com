-- DHL/MNG API Entegrasyonu İçin Gerekli Sipariş Tablosu Eklemeleri
-- Bu migration sadece analiz ve hazırlık amaçlıdır.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS dhl_shipment_id text,
ADD COLUMN IF NOT EXISTS dhl_invoice_id text,
ADD COLUMN IF NOT EXISTS dhl_barcodes jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dhl_status text,
ADD COLUMN IF NOT EXISTS dhl_error text,
ADD COLUMN IF NOT EXISTS dhl_created_at timestamptz,
ADD COLUMN IF NOT EXISTS dhl_updated_at timestamptz;
