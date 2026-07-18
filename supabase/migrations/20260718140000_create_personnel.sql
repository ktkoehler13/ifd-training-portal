-- IFD Training Portal: personnel table and row level security
-- Safe to rerun in the Supabase SQL editor or via the Supabase CLI.

-- A. Generic trigger functions that do not query personnel
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_personnel_badge_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.badge_number = trim(new.badge_number);

  if new.badge_number = '' then
    raise exception 'badge_number cannot be empty after trimming whitespace';
  end if;

  return new;
end;
$$;

create or replace function public.normalize_personnel_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = lower(trim(new.email));

  if new.email = '' then
    raise exception 'email cannot be empty after trimming whitespace';
  end if;

  return new;
end;
$$;

-- B. Create personnel table
create table if not exists public.personnel (
  id uuid primary key default gen_random_uuid(),
  badge_number text not null,
  email text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- C. Add or verify constraints only when missing
do $$
begin
  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_badge_number_unique'
  ) then
    alter table public.personnel
      add constraint personnel_badge_number_unique unique (badge_number);
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_email_unique'
  ) then
    alter table public.personnel
      add constraint personnel_email_unique unique (email);
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_role_check'
  ) then
    alter table public.personnel
      add constraint personnel_role_check check (
        role in ('firefighter', 'mto', 'deputy_chief', 'admin')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_badge_number_not_empty'
  ) then
    alter table public.personnel
      add constraint personnel_badge_number_not_empty check (
        length(trim(badge_number)) > 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_email_lowercase'
  ) then
    alter table public.personnel
      add constraint personnel_email_lowercase check (email = lower(email));
  end if;
end;
$$;

create index if not exists personnel_email_idx on public.personnel (email);
create index if not exists personnel_role_idx on public.personnel (role);
create index if not exists personnel_active_idx on public.personnel (active);

-- D. Create triggers before constraints are evaluated on each row
drop trigger if exists personnel_normalize_badge_number on public.personnel;
create trigger personnel_normalize_badge_number
before insert or update of badge_number on public.personnel
for each row
execute function public.normalize_personnel_badge_number();

drop trigger if exists personnel_normalize_email on public.personnel;
create trigger personnel_normalize_email
before insert or update of email on public.personnel
for each row
execute function public.normalize_personnel_email();

drop trigger if exists personnel_set_updated_at on public.personnel;
create trigger personnel_set_updated_at
before update on public.personnel
for each row
execute function public.set_updated_at();

-- E. SECURITY DEFINER authorization helpers that query personnel
create or replace function public.current_personnel_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.personnel as p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and p.active = true
  limit 1;
$$;

create or replace function public.current_personnel_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_personnel_role() is not null;
$$;

create or replace function public.is_personnel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_personnel_role() = 'admin';
$$;

create or replace function public.is_personnel_routing_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_personnel_role() in ('mto', 'deputy_chief', 'admin');
$$;

-- F. Revoke/grant helper-function execution permissions
revoke all on function public.current_personnel_role() from public;
revoke all on function public.current_personnel_is_active() from public;
revoke all on function public.is_personnel_admin() from public;
revoke all on function public.is_personnel_routing_role() from public;

grant execute on function public.current_personnel_role() to authenticated;
grant execute on function public.current_personnel_is_active() to authenticated;
grant execute on function public.is_personnel_admin() to authenticated;
grant execute on function public.is_personnel_routing_role() to authenticated;

-- G. Enable RLS
alter table public.personnel enable row level security;

-- H. Drop and recreate policies
drop policy if exists "personnel_select_own" on public.personnel;
drop policy if exists "personnel_select_routing_roles" on public.personnel;
drop policy if exists "personnel_admin_insert" on public.personnel;
drop policy if exists "personnel_admin_update" on public.personnel;
drop policy if exists "personnel_admin_delete" on public.personnel;

create policy "personnel_select_own"
on public.personnel
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "personnel_select_routing_roles"
on public.personnel
for select
to authenticated
using (
  active = true
  and public.is_personnel_routing_role()
);

create policy "personnel_admin_insert"
on public.personnel
for insert
to authenticated
with check (
  public.is_personnel_admin()
);

create policy "personnel_admin_update"
on public.personnel
for update
to authenticated
using (
  public.is_personnel_admin()
)
with check (
  public.is_personnel_admin()
);

create policy "personnel_admin_delete"
on public.personnel
for delete
to authenticated
using (
  public.is_personnel_admin()
);

-- I. Comments
comment on function public.set_updated_at() is
  'Maintains personnel.updated_at on row updates.';

comment on function public.normalize_personnel_badge_number() is
  'Trims badge_number before insert or update and rejects empty values.';

comment on function public.normalize_personnel_email() is
  'Lowercases and trims email before insert or update so uniqueness checks use normalized values.';

comment on function public.current_personnel_role() is
  'Returns the active personnel role for the authenticated JWT email. Uses SECURITY DEFINER to avoid recursive RLS policy evaluation.';

comment on function public.current_personnel_is_active() is
  'Returns true when the authenticated JWT email matches an active personnel row.';

comment on function public.is_personnel_admin() is
  'Returns true when the authenticated user is an active admin personnel record.';

comment on function public.is_personnel_routing_role() is
  'Returns true when the authenticated user is an active MTO, Deputy Chief, or Admin personnel record.';

comment on table public.personnel is
  'Minimal personnel directory keyed by badge number and department email. Names, phone numbers, and other PII are intentionally excluded until Microsoft 365 authentication is implemented.';

comment on policy "personnel_select_own" on public.personnel is
  'Authenticated users may read only their own personnel row by JWT email match.';

comment on policy "personnel_select_routing_roles" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may read active personnel rows needed for request routing.';

comment on policy "personnel_admin_insert" on public.personnel is
  'Only active Admin users may insert personnel records.';

comment on policy "personnel_admin_update" on public.personnel is
  'Only active Admin users may update roles and deactivate personnel records.';

comment on policy "personnel_admin_delete" on public.personnel is
  'Only active Admin users may delete personnel records.';
