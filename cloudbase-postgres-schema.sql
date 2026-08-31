create table if not exists vr_records (
  id bigserial primary key,
  collection text not null,
  record_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (collection, record_key)
);

create or replace function update_vr_records_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_vr_records_updated_at on vr_records;

create trigger trg_update_vr_records_updated_at
before update on vr_records
for each row
execute function update_vr_records_updated_at();
