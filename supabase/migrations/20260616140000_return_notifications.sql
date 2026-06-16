-- İade talebi bildirim takibi için return_requests tablosuna yeni kolonlar eklenmesi
do $$ 
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'return_requests') then
    alter table return_requests add column if not exists email_notified_at timestamptz;
    alter table return_requests add column if not exists whatsapp_notified_at timestamptz;
    alter table return_requests add column if not exists whatsapp_notified_by text;
  end if;
end $$;
