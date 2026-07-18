-- IFD Training Portal: personnel table and row level security
-- Run this migration in the Supabase SQL editor or via the Supabase CLI.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_personnel_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

create table if not exists public.personnel (
  id uuid primary key default gen_random_uuid(),
  badge_number text not null,
  email text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_badge_number_unique unique (badge_number),
  constraint personnel_email_unique unique (email),
  constraint personnel_role_check check (
    role in ('firefighter', 'mto', 'deputy_chief', 'admin')
  )
);

create index if not exists personnel_email_idx on public.personnel (email);
create index if not exists personnel_role_idx on public.personnel (role);
create index if not exists personnel_active_idx on public.personnel (active);

drop trigger if exists personnel_set_updated_at on public.personnel;
create trigger personnel_set_updated_at
before update on public.personnel
for each row
execute function public.set_updated_at();

drop trigger if exists personnel_normalize_email on public.personnel;
create trigger personnel_normalize_email
before insert or update on public.personnel
for each row
execute function public.normalize_personnel_email();

alter table public.personnel enable row level security;

-- Anonymous access is denied by default because no permissive policies exist for anon.

-- Placeholder policy: firefighters may eventually read only their own row.
create policy "personnel_select_own"
on public.personnel
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- Placeholder policy: MTO, Deputy Chief, and Admin may eventually read active personnel for routing.
create policy "personnel_select_routing_roles"
on public.personnel
for select
to authenticated
using (
  active = true
  and exists (
    select 1
    from public.personnel as viewer
    where lower(viewer.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and viewer.active = true
      and viewer.role in ('mto', 'deputy_chief', 'admin')
  )
);

-- Placeholder policy: only admins may eventually insert personnel records.
create policy "personnel_admin_insert"
on public.personnel
for insert
to authenticated
with check (
  exists (
    select 1
    from public.personnel as viewer
    where lower(viewer.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and viewer.active = true
      and viewer.role = 'admin'
  )
);

-- Placeholder policy: only admins may eventually update personnel records.
create policy "personnel_admin_update"
on public.personnel
for update
to authenticated
using (
  exists (
    select 1
    from public.personnel as viewer
    where lower(viewer.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and viewer.active = true
      and viewer.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.personnel as viewer
    where lower(viewer.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and viewer.active = true
      and viewer.role = 'admin'
  )
);

-- Placeholder policy: only admins may eventually delete personnel records.
create policy "personnel_admin_delete"
on public.personnel
for delete
to authenticated
using (
  exists (
    select 1
    from public.personnel as viewer
    where lower(viewer.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and viewer.active = true
      and viewer.role = 'admin'
  )
);

comment on table public.personnel is
  'Minimal personnel directory keyed by badge number and department email. Names, phone numbers, and other PII are intentionally excluded until Microsoft 365 authentication is implemented.';

comment on policy "personnel_select_own" on public.personnel is
  'Future Microsoft 365 users will read only their own personnel row when authenticated.';

comment on policy "personnel_select_routing_roles" on public.personnel is
  'Future MTO, Deputy Chief, and Admin users will read active personnel needed for request routing.';

comment on policy "personnel_admin_insert" on public.personnel is
  'Future Admin users will insert personnel records after Microsoft 365 authentication is connected.';

comment on policy "personnel_admin_update" on public.personnel is
  'Future Admin users will update roles and deactivate personnel records.';

comment on policy "personnel_admin_delete" on public.personnel is
  'Future Admin users may delete personnel records if required by future workflows.';
