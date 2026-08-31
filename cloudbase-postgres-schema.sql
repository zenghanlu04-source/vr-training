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

-- Only authenticated CloudBase users can access shared team data.
alter table vr_records enable row level security;

revoke all on table vr_records from anon;
revoke all on sequence vr_records_id_seq from anon;
grant select, insert, update, delete on table vr_records to authenticated;
grant usage, select on sequence vr_records_id_seq to authenticated;

drop policy if exists vr_records_team_select on vr_records;
drop policy if exists vr_records_team_insert on vr_records;
drop policy if exists vr_records_team_update on vr_records;
drop policy if exists vr_records_team_delete on vr_records;

create policy vr_records_team_select on vr_records
for select to authenticated
using ((select auth.uid()) is not null);

create policy vr_records_team_insert on vr_records
for insert to authenticated
with check ((select auth.uid()) is not null);

create policy vr_records_team_update on vr_records
for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy vr_records_team_delete on vr_records
for delete to authenticated
using ((select auth.uid()) is not null);

-- Remove passwords stored by the former prototype login implementation.
delete from vr_records where collection = 'app_accounts';
