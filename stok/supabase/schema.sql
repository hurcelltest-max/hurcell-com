-- Supabase database schema for stok project
-- Tables: products, stock_movements, sales

create extension if not exists "pgcrypto";

create type movement_type as enum ('IN', 'OUT', 'ADJUSTMENT');

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  name text not null,
  category text,
  stock integer not null default 0,
  buy_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  min_stock integer not null default 0,
  location text,
  is_slider_visible boolean default false,
  is_campaign boolean default false,
  campaign_title text,
  campaign_benefit text,
  show_campaign_benefit_in_slider boolean default false,
  campaign_benefit_requires_return boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  movement_type movement_type not null,
  quantity integer not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  total_price numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product_id on stock_movements(product_id);
create index if not exists idx_sales_product_id on sales(product_id);

-- Enable Row Level Security (RLS) on all tables
alter table products enable row level security;
alter table sales enable row level security;
alter table stock_movements enable row level security;

-- Policies for products table
create policy "Allow SELECT on products for authenticated users only"
  on products for select
  to authenticated
  using (true);

create policy "Allow INSERT on products for authenticated users only"
  on products for insert
  to authenticated
  with check (true);

create policy "Allow UPDATE on products for authenticated users only"
  on products for update
  to authenticated
  using (true)
  with check (true);

-- Policies for sales table
create policy "Allow SELECT on sales for authenticated users only"
  on sales for select
  to authenticated
  using (true);

create policy "Allow INSERT on sales for authenticated users only"
  on sales for insert
  to authenticated
  with check (true);

create policy "Allow UPDATE on sales for authenticated users only"
  on sales for update
  to authenticated
  using (true)
  with check (true);

-- Policies for stock_movements table
create policy "Allow SELECT on stock_movements for authenticated users only"
  on stock_movements for select
  to authenticated
  using (true);

create policy "Allow INSERT on stock_movements for authenticated users only"
  on stock_movements for insert
  to authenticated
  with check (true);

create policy "Allow UPDATE on stock_movements for authenticated users only"
  on stock_movements for update
  to authenticated
  using (true)
  with check (true);

