-- Expand personnel administration to MTO and Deputy Chief while preserving
-- distinct workflow role values for future request routing.

create or replace function public.is_personnel_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_personnel_role() in ('mto', 'deputy_chief', 'admin');
$$;

drop policy if exists "personnel_admin_insert" on public.personnel;
drop policy if exists "personnel_admin_update" on public.personnel;
drop policy if exists "personnel_admin_delete" on public.personnel;
drop policy if exists "personnel_select_routing_roles" on public.personnel;
drop policy if exists "personnel_select_administrator" on public.personnel;
drop policy if exists "personnel_administrator_insert" on public.personnel;
drop policy if exists "personnel_administrator_update" on public.personnel;
drop policy if exists "personnel_system_admin_delete" on public.personnel;
drop policy if exists "personnel_administrator_delete" on public.personnel;

create policy "personnel_select_administrator"
on public.personnel
for select
to authenticated
using (
  public.is_personnel_administrator()
);

create policy "personnel_select_routing_roles"
on public.personnel
for select
to authenticated
using (
  active = true
  and public.is_personnel_routing_role()
);

create policy "personnel_administrator_insert"
on public.personnel
for insert
to authenticated
with check (
  public.is_personnel_administrator()
);

create policy "personnel_administrator_update"
on public.personnel
for update
to authenticated
using (
  public.is_personnel_administrator()
)
with check (
  public.is_personnel_administrator()
);

create policy "personnel_administrator_delete"
on public.personnel
for delete
to authenticated
using (
  public.is_personnel_administrator()
);

drop function if exists public.is_personnel_admin();
drop function if exists public.is_system_admin();

revoke all on function public.is_personnel_administrator() from public;
grant execute on function public.is_personnel_administrator() to authenticated;

comment on function public.is_personnel_administrator() is
  'Returns true when the authenticated user is an active MTO, Deputy Chief, or Admin personnel record with equal administrative privileges.';

comment on policy "personnel_select_administrator" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may read all personnel records.';

comment on policy "personnel_select_routing_roles" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may read active personnel rows needed for request routing.';

comment on policy "personnel_administrator_insert" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may insert personnel records and assign any valid role.';

comment on policy "personnel_administrator_update" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may edit, activate, deactivate, and reassign personnel records.';

comment on policy "personnel_administrator_delete" on public.personnel is
  'Active MTO, Deputy Chief, and Admin users may hard-delete personnel records.';
