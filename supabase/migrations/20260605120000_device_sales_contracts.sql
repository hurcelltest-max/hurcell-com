-- HurCELL cihaz satış sözleşmesi ve atomik stok düşme altyapısı
-- Bu migration Supabase SQL Editor veya Supabase migration akışı ile çalıştırılmalıdır.

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

create index if not exists device_sale_contracts_product_id_idx
  on public.device_sale_contracts(product_id);

create index if not exists device_sale_contracts_sale_code_idx
  on public.device_sale_contracts(sale_code);

create index if not exists device_sale_contracts_created_at_idx
  on public.device_sale_contracts(created_at desc);

-- Not: Mevcut stok tablonuzun adı farklıysa aşağıdaki bölümde public.products ve stock alanını uyarlayın.
-- Beklenen minimum ürün kolonları:
-- public.products.id veya public.products.sku gibi ürün kimliği
-- public.products.stock integer

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
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Satış adedi geçersiz.';
  end if;

  -- Ürün stoktan atomik şekilde düşülür. Yeterli stok yoksa update olmaz.
  update public.products
     set stock = stock - p_quantity
   where id::text = p_product_id
     and stock >= p_quantity;

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    raise exception 'Stok yetersiz veya ürün bulunamadı.';
  end if;

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
    status
  ) values (
    p_sale_code,
    p_product_id,
    p_channel,
    p_quantity,
    p_sale_price,
    p_customer,
    p_device,
    coalesce(p_cosmetic, '{}'::jsonb),
    coalesce(p_tests, '{}'::jsonb),
    coalesce(p_known_issues, '[]'::jsonb),
    coalesce(p_included_items, '[]'::jsonb),
    p_customer_declaration,
    p_contract_text,
    p_signature_data_url,
    'completed'
  ) returning * into v_contract;

  return v_contract;
end;
$$;

revoke all on function public.complete_device_sale from public;
revoke all on function public.complete_device_sale from anon;
revoke all on function public.complete_device_sale from authenticated;

-- API tarafı service role key ile çalıştığı için bu fonksiyonu tarayıcıdan doğrudan açmıyoruz.
