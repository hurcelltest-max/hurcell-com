-- HurCELL Cihaz Satış Kabul/Teslim Protokolü Altyapısı Migration
-- Bu script Supabase SQL Editör üzerinden doğrudan çalıştırılabilir. Hem ilk kurulum hem de mevcut kurulum ile uyumludur.

-- 1. Cryptographic Extension Kurulumu
create extension if not exists pgcrypto;

-- 2. device_sale_contracts Tablosunu Oluştur (Yoksa)
create table if not exists public.device_sale_contracts (
  id uuid primary key default gen_random_uuid(),
  sale_code text not null unique,
  product_id text not null,
  channel text not null check (channel in ('store', 'online')),
  quantity integer not null check (quantity > 0),
  sale_price numeric(12, 2),
  customer jsonb not null,
  device jsonb not null,
  cosmetic jsonb not null default '{}'::jsonb,
  tests jsonb not null default '{}'::jsonb,
  known_issues jsonb not null default '[]'::jsonb,
  included_items jsonb not null default '[]'::jsonb,
  customer_declaration text not null,
  contract_text text not null,
  signature_data_url text,
  status text not null default 'completed' check (status in ('draft', 'completed', 'cancelled', 'refunded')),
  created_at timestamptz not null default now()
);

-- 3. device_sale_contracts Tablosu Kolonlarını Güvenli Şekilde Tamamla
alter table public.device_sale_contracts add column if not exists device_condition_type text;
alter table public.device_sale_contracts add column if not exists device_category text;
alter table public.device_sale_contracts add column if not exists device_type_details jsonb not null default '{}'::jsonb;
alter table public.device_sale_contracts add column if not exists stock_snapshot jsonb not null default '{}'::jsonb;

-- 4. products (Stok) Tablosuna Kabul ve Kimlik Alanlarını Ekle
alter table public.products add column if not exists device_condition_type text;
alter table public.products add column if not exists device_category text;
alter table public.products add column if not exists imei_1 text;
alter table public.products add column if not exists imei_2 text;
alter table public.products add column if not exists serial_number text;
alter table public.products add column if not exists battery_health text;
alter table public.products add column if not exists box_status text;
alter table public.products add column if not exists warranty_status text;
alter table public.products add column if not exists supplier_name text;
alter table public.products add column if not exists supplier_invoice_no text;
alter table public.products add column if not exists service_report_no text;
alter table public.products add column if not exists device_metadata jsonb not null default '{}'::jsonb;

-- 5. Cihaz Durumu Değerleri için Check Constraint Ekle
alter table public.products drop constraint if exists chk_products_device_condition_type;
alter table public.products add constraint chk_products_device_condition_type check (
  device_condition_type is null or 
  device_condition_type in ('new_sealed', 'new_open_box', 'display', 'used', 'refurbished', 'authorized_refurbished')
);

alter table public.device_sale_contracts drop constraint if exists chk_contracts_device_condition_type;
alter table public.device_sale_contracts add constraint chk_contracts_device_condition_type check (
  device_condition_type is null or 
  device_condition_type in ('new_sealed', 'new_open_box', 'display', 'used', 'refurbished', 'authorized_refurbished')
);

-- 6. İndeksleri Tanımla
create index if not exists device_sale_contracts_product_id_idx on public.device_sale_contracts(product_id);
create index if not exists device_sale_contracts_sale_code_idx on public.device_sale_contracts(sale_code);
create index if not exists device_sale_contracts_created_at_idx on public.device_sale_contracts(created_at desc);

-- 7. Atomik İşlem Tetikleme Fonksiyonu (Hata Yutmaz, Rollback Garantilidir)
create or replace function public.complete_device_sale(
  p_product_id text,
  p_quantity integer,
  p_sale_code text,
  p_channel text,
  p_customer jsonb,
  p_device jsonb,
  p_cosmetic jsonb,
  p_tests jsonb,
  p_known_issues jsonb,
  p_included_items jsonb,
  p_customer_declaration text,
  p_contract_text text,
  p_signature_data_url text default null,
  p_sale_price numeric default null
)
returns public.device_sale_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.device_sale_contracts;
  v_updated_count integer;
  v_product_id uuid;
  v_unit_price numeric(12, 2);
  v_product_name text;
  v_device_condition_type text;
  v_device_category text;
  v_stock_snapshot jsonb;
  
  -- Ürünün diğer temel stok verileri (Snapshot için)
  v_brand text;
  v_model text;
  v_barcode text;
  v_imei_1 text;
  v_imei_2 text;
  v_serial_number text;
  v_battery_health text;
  v_box_status text;
  v_warranty_status text;
  v_service_report_no text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Satış adedi geçersiz.';
  end if;

  -- Ürün bilgilerini sorgula
  select 
    id, 
    sell_price, 
    name,
    device_condition_type,
    coalesce(device_category, category),
    brand,
    model,
    barcode,
    imei_1,
    imei_2,
    serial_number,
    battery_health,
    box_status,
    warranty_status,
    service_report_no
  into 
    v_product_id, 
    v_unit_price, 
    v_product_name,
    v_device_condition_type,
    v_device_category,
    v_brand,
    v_model,
    v_barcode,
    v_imei_1,
    v_imei_2,
    v_serial_number,
    v_battery_health,
    v_box_status,
    v_warranty_status,
    v_service_report_no
  from public.products
  where (id::text = p_product_id or barcode = p_product_id);

  if v_product_id is null then
    raise exception 'Ürün bulunamadı.';
  end if;

  -- Cihaz durumu doğrulama (Telefon, Tablet, Bilgisayar kategorileri için zorunlu)
  if (v_device_category in ('phone', 'tablet', 'computer', 'Cep Telefonu', 'Tablet', 'Bilgisayar', 'Telefon') 
      or v_device_category ilike '%telefon%' 
      or v_device_category ilike '%tablet%' 
      or v_device_category ilike '%bilgisayar%' 
      or v_device_category ilike '%laptop%')
     and (v_device_condition_type is null or v_device_condition_type = '') then
    raise exception 'Bu cihazın stok kartında ürün durumu seçilmemiş. Satış protokolü oluşturulmadan önce cihaz durumu seçilmelidir.';
  end if;

  -- Ürün stoktan atomik şekilde düşülür. Yeterli stok yoksa exception fırlatılır.
  update public.products
     set stock = stock - p_quantity
   where id = v_product_id
     and stock >= p_quantity;

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    raise exception 'Stok yetersiz.';
  end if;

  -- Değişmez anlık stok snapshot verisini oluştur
  v_stock_snapshot := jsonb_build_object(
    'name', v_product_name,
    'brand', v_brand,
    'model', v_model,
    'barcode', v_barcode,
    'imei_1', v_imei_1,
    'imei_2', v_imei_2,
    'serial_number', v_serial_number,
    'device_condition_type', v_device_condition_type,
    'device_category', v_device_category,
    'battery_health', v_battery_health,
    'box_status', v_box_status,
    'warranty_status', v_warranty_status,
    'service_report_no', v_service_report_no,
    'sale_price', coalesce(p_sale_price, v_unit_price, 0),
    'quantity_deducted', p_quantity
  );

  -- Stok hareketini kaydet (İşlem başarısızsa transaction iptal olur)
  insert into public.stock_movements (
    product_id,
    movement_type,
    quantity,
    note
  ) values (
    v_product_id,
    'OUT',
    p_quantity,
    'Cihaz Kabul ve Teslim Protokolü Satışı. Protokol Kodu: ' || p_sale_code
  );

  -- Satış kaydını oluştur
  insert into public.sales (
    product_id,
    quantity,
    unit_price,
    total_price
  ) values (
    v_product_id,
    p_quantity,
    coalesce(p_sale_price, v_unit_price, 0),
    coalesce(p_sale_price, v_unit_price, 0) * p_quantity
  );

  -- Sözleşmeyi / Protokolü kaydet
  insert into public.device_sale_contracts (
    sale_code,
    product_id,
    channel,
    quantity,
    sale_price,
    customer,
    device,
    cosmetic,
    tests,
    known_issues,
    included_items,
    customer_declaration,
    contract_text,
    signature_data_url,
    device_condition_type,
    device_category,
    device_type_details,
    stock_snapshot,
    status
  ) values (
    p_sale_code,
    v_product_id::text,
    p_channel,
    p_quantity,
    coalesce(p_sale_price, v_unit_price),
    p_customer,
    p_device,
    coalesce(p_cosmetic, '{}'::jsonb),
    coalesce(p_tests, '{}'::jsonb),
    coalesce(p_known_issues, '[]'::jsonb),
    coalesce(p_included_items, '[]'::jsonb),
    p_customer_declaration,
    p_contract_text,
    p_signature_data_url,
    v_device_condition_type,
    v_device_category,
    coalesce(p_device, '{}'::jsonb),
    v_stock_snapshot,
    'completed'
  ) returning * into v_contract;

  return v_contract;
end;
$$;

-- 8. Yetki Sınırlandırması (Sadece service_role / API tetikleyebilir)
revoke all on function public.complete_device_sale from public;
revoke all on function public.complete_device_sale from anon;
revoke all on function public.complete_device_sale from authenticated;
grant execute on function public.complete_device_sale to service_role;

-- 9. device_sale_contracts Tablosu için Kişisel Veri Güvenliği (RLS)
alter table public.device_sale_contracts enable row level security;

revoke all on table public.device_sale_contracts from public;
revoke all on table public.device_sale_contracts from anon;
revoke all on table public.device_sale_contracts from authenticated;

grant all on table public.device_sale_contracts to service_role;

-- 10. products tablosu için device_metadata null koruma trigger'ı
create or replace function public.ensure_product_device_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.device_metadata is null then
    new.device_metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_product_device_metadata on public.products;

create trigger trg_ensure_product_device_metadata
before insert or update on public.products
for each row
execute function public.ensure_product_device_metadata();
