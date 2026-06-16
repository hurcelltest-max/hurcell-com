-- Slayt ve Kampanya özellikleri için products tablosuna yeni kolonlar eklenmesi
alter table products add column if not exists is_slider_visible boolean default false;
alter table products add column if not exists is_campaign boolean default false;
alter table products add column if not exists campaign_title text;
alter table products add column if not exists campaign_benefit text;
alter table products add column if not exists show_campaign_benefit_in_slider boolean default false;
alter table products add column if not exists campaign_benefit_requires_return boolean default false;

-- İade takibi için (varsa) iade talepleri tablosuna kampanya hediyesinin dönüşünü takip eden kolon
do $$ 
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'return_requests') then
    alter table return_requests add column if not exists campaign_benefit_returned boolean default false;
  end if;
end $$;
