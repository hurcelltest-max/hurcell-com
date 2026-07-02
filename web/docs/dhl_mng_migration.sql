-- DHL/MNG API Entegrasyonu İçin Gerekli Sipariş Tablosu Eklemeleri (3 Aşamalı Akış)
-- Bu migration sadece analiz ve hazırlık amaçlıdır. Production'a uygulanmamıştır.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS dhl_recipient_created_at timestamptz,
ADD COLUMN IF NOT EXISTS dhl_order_created_at timestamptz,
ADD COLUMN IF NOT EXISTS dhl_barcode_created_at timestamptz,
ADD COLUMN IF NOT EXISTS dhl_reference_id text,
ADD COLUMN IF NOT EXISTS dhl_order_invoice_id text,
ADD COLUMN IF NOT EXISTS dhl_order_invoice_detail_id text,
ADD COLUMN IF NOT EXISTS dhl_shipper_branch_code text,
ADD COLUMN IF NOT EXISTS dhl_order_response jsonb,
ADD COLUMN IF NOT EXISTS dhl_barcode_response jsonb,
ADD COLUMN IF NOT EXISTS dhl_barcodes jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dhl_tracking_number text,
ADD COLUMN IF NOT EXISTS dhl_zpl text,
ADD COLUMN IF NOT EXISTS dhl_status text,
ADD COLUMN IF NOT EXISTS dhl_error text,
ADD COLUMN IF NOT EXISTS dhl_cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS dhl_updated_at timestamptz;
