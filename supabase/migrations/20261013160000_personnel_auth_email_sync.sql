-- Keep personnel email and the existing sign-in identity in the same transaction.
-- Passwords, request ownership, and historical approval snapshots are unchanged.
begin;

alter table public.personnel add column auth_user_id uuid
  references auth.users(id) on delete set null;
create unique index personnel_auth_user_id_unique on public.personnel(auth_user_id);

-- Link only unambiguous current matches; never guess from names or badge numbers.
update public.personnel p set auth_user_id = u.id
from auth.users u
where lower(trim(u.email)) = p.email
  and (select count(*) from auth.users a where lower(trim(a.email)) = p.email) = 1;

create function public.guard_personnel_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  linked_id uuid;
  linked_email text;
begin
  new.email := lower(trim(new.email));
  if tg_op = 'UPDATE' and old.auth_user_id is not null then
    -- FK cleanup after deleting an Auth account must not delete personnel history.
    if not exists(select 1 from auth.users where id = old.auth_user_id) then
      new.auth_user_id := null;
      return new;
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'The sign-in account link cannot be changed.' using errcode = '42501';
    end if;
    linked_id := old.auth_user_id;
  else
    select u.id into linked_id from auth.users u
    where lower(trim(u.email)) = case when tg_op = 'UPDATE' then old.email else new.email end
      and (select count(*) from auth.users a where lower(trim(a.email)) = lower(trim(u.email))) = 1;
    if new.auth_user_id is not null and new.auth_user_id is distinct from linked_id then
      raise exception 'The sign-in account link does not match this personnel record.' using errcode = '42501';
    end if;
    new.auth_user_id := linked_id;
  end if;

  if linked_id is not null then
    select lower(trim(email)) into linked_email from auth.users where id = linked_id;
    if new.email is distinct from linked_email then
      raise exception 'Use User Management to change the sign-in email. Refresh the page and try again.' using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' and new.email is distinct from old.email then
    raise exception 'This personnel record has no linked sign-in account. Contact an administrator.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger personnel_auth_email_guard before insert or update on public.personnel
for each row execute function public.guard_personnel_auth_email();

create function public.sync_personnel_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.personnel set auth_user_id = new.id
    where auth_user_id is null and email = lower(trim(new.email));
  elsif new.email is distinct from old.email then
    -- A uniqueness/validation failure rolls back the Auth email update too.
    update public.personnel set email = lower(trim(new.email))
    where auth_user_id = new.id;
  end if;
  return new;
end;
$$;
create trigger ifd_auth_email_sync after insert or update of email on auth.users
for each row execute function public.sync_personnel_auth_email();

revoke all on function public.guard_personnel_auth_email() from public, anon, authenticated;
revoke all on function public.sync_personnel_auth_email() from public, anon, authenticated;
comment on column public.personnel.auth_user_id is
  'Stable sign-in identity. Auth email updates synchronize personnel email atomically; never relink by edited email.';
notify pgrst, 'reload schema';
commit;
