begin;

-- Separate from the routing directory: a saved home address is visible only to its owner.
create table public.personnel_addresses (
  personnel_id uuid primary key references public.personnel(id) on delete cascade,
  street_address text not null check (char_length(street_address) between 1 and 160),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip text not null check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  updated_at timestamptz not null default now()
);

create function public.normalize_personnel_address()
returns trigger language plpgsql set search_path = public as $$
begin
  new.street_address := btrim(regexp_replace(new.street_address, '\s+', ' ', 'g'));
  new.city := btrim(regexp_replace(new.city, '\s+', ' ', 'g'));
  new.state := upper(btrim(new.state));
  new.zip := btrim(new.zip);
  new.updated_at := now();
  return new;
end;
$$;

create trigger normalize_personnel_address before insert or update on public.personnel_addresses
for each row execute function public.normalize_personnel_address();

alter table public.personnel_addresses enable row level security;
revoke all on public.personnel_addresses from public, anon, authenticated;
grant select, insert, update, delete on public.personnel_addresses to authenticated;
grant all on public.personnel_addresses to service_role;
revoke all on function public.normalize_personnel_address() from public, anon, authenticated;

create policy personnel_address_own_select on public.personnel_addresses for select to authenticated
using (personnel_id = (select public.current_personnel_id()));
create policy personnel_address_own_insert on public.personnel_addresses for insert to authenticated
with check (personnel_id = (select public.current_personnel_id()));
create policy personnel_address_own_update on public.personnel_addresses for update to authenticated
using (personnel_id = (select public.current_personnel_id()))
with check (personnel_id = (select public.current_personnel_id()));
create policy personnel_address_own_delete on public.personnel_addresses for delete to authenticated
using (personnel_id = (select public.current_personnel_id()));

comment on table public.personnel_addresses is 'Optional owner-managed address for new-request autofill. Existing requests retain their own address snapshot.';
notify pgrst, 'reload schema';
commit;
