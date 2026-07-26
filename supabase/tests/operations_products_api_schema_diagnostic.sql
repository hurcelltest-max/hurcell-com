-- ============================================================================
-- HURCELL OPERASYON MERKEZİ - PRODUCTS API SCHEMA DIAGNOSTIC (READ-ONLY)
-- ============================================================================
-- Bu script, public.products tablosundaki API allowlist kolonlarının varlığını,
-- veri tiplerini ve null yetkilerini salt okunur SELECT ile denetler.
-- Hiçbir DML/DDL (INSERT, UPDATE, DELETE, ALTER, DROP) işlemi içermez.
-- ============================================================================

WITH expected_columns(col_name, expected_type) AS (
  VALUES
    ('id', 'uuid'),
    ('name', 'text'),
    ('sku', 'text'),
    ('barcode', 'text'),
    ('category', 'text'),
    ('brand', 'text'),
    ('stock', 'integer'),
    ('price', 'numeric'),
    ('cost_price', 'numeric'),
    ('min_stock_level', 'integer'),
    ('shelf_location', 'text'),
    ('unit', 'text'),
    ('is_active', 'boolean'),
    ('is_web_visible', 'boolean'),
    ('whatsapp_enabled', 'boolean'),
    ('whatsapp_display_name', 'text'),
    ('whatsapp_description', 'text'),
    ('whatsapp_price', 'numeric'),
    ('whatsapp_sort_order', 'integer'),
    ('image_url', 'text'),
    ('created_at', 'timestamp with time zone')
)
SELECT
  e.col_name AS column_name,
  COALESCE(c.data_type, 'MISSING') AS data_type,
  COALESCE(c.udt_name, 'MISSING') AS udt_name,
  COALESCE(c.is_nullable, 'UNKNOWN') AS is_nullable,
  COALESCE(c.column_default, 'NONE') AS column_default,
  CASE
    WHEN c.column_name IS NOT NULL THEN 'EXISTS'
    ELSE 'MISSING'
  END AS exists_status
FROM expected_columns e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'products'
 AND c.column_name = e.col_name
ORDER BY c.ordinal_position NULLS LAST, e.col_name;
