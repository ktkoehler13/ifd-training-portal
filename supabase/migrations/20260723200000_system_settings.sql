-- Application-wide settings (e.g. current GSA mileage rate).

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by_personnel_id uuid null references public.personnel (id) on delete set null
);

create table if not exists public.system_settings_audit (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  old_value text null,
  new_value text not null,
  changed_by_personnel_id uuid null references public.personnel (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists system_settings_audit_setting_key_changed_at_idx
  on public.system_settings_audit (setting_key, changed_at desc);

create trigger system_settings_set_updated_at
before update on public.system_settings
for each row
execute function public.set_updated_at();

alter table public.system_settings enable row level security;
alter table public.system_settings_audit enable row level security;

create policy "system_settings_select_authenticated"
on public.system_settings
for select
to authenticated
using (
  public.current_personnel_is_active()
);

create policy "system_settings_audit_select_administrator"
on public.system_settings_audit
for select
to authenticated
using (
  public.is_personnel_administrator()
);

comment on table public.system_settings is
  'Key/value application settings. The GSA mileage rate is stored under key gsa_mileage_rate. Seed manually or via the admin settings UI when missing.';

comment on table public.system_settings_audit is
  'Audit trail for system setting changes. Does not store secrets.';
