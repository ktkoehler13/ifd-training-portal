-- Add personnel first and last names and copy trusted requester names onto requests.

alter table public.personnel
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.normalize_personnel_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name := nullif(btrim(coalesce(new.first_name, '')), '');
  new.last_name := nullif(btrim(coalesce(new.last_name, '')), '');
  return new;
end;
$$;

drop trigger if exists personnel_normalize_name on public.personnel;
create trigger personnel_normalize_name
before insert or update of first_name, last_name on public.personnel
for each row
execute function public.normalize_personnel_name();

comment on column public.personnel.first_name is
  'Personnel first name. Trimmed on write; blank values are stored as null until entered by an administrator.';

comment on column public.personnel.last_name is
  'Personnel last name. Trimmed on write; blank values are stored as null until entered by an administrator.';

create or replace function public.set_training_request_requester_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personnel_id uuid;
  personnel_first_name text;
  personnel_last_name text;
begin
  personnel_id := public.current_personnel_id();

  if personnel_id is null then
    raise exception 'Active authenticated personnel record required to create training request';
  end if;

  select p.id, p.badge_number, p.email, p.first_name, p.last_name
  into
    new.requester_personnel_id,
    new.requester_badge_number,
    new.requester_email,
    personnel_first_name,
    personnel_last_name
  from public.personnel as p
  where p.id = personnel_id
    and p.active = true;

  if new.requester_personnel_id is null then
    raise exception 'Active authenticated personnel record required to create training request';
  end if;

  if personnel_first_name is null or personnel_last_name is null then
    raise exception 'Your personnel profile must include a first and last name before creating a training request';
  end if;

  new.requester_name := btrim(personnel_first_name || ' ' || personnel_last_name);

  return new;
end;
$$;

comment on function public.set_training_request_requester_identity() is
  'Assigns trusted requester ownership fields and requester_name snapshot from the authenticated active personnel record on insert.';

create or replace function public.protect_training_request_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.requester_personnel_id := old.requester_personnel_id;
  new.requester_badge_number := old.requester_badge_number;
  new.requester_email := old.requester_email;
  new.requester_name := old.requester_name;
  new.request_number := old.request_number;
  new.created_at := old.created_at;

  return new;
end;
$$;

revoke all on function public.normalize_personnel_name() from public;
revoke all on function public.normalize_personnel_name() from anon;
revoke all on function public.normalize_personnel_name() from authenticated;

revoke all on function public.protect_training_request_immutable_fields() from public;
revoke all on function public.protect_training_request_immutable_fields() from anon;
revoke all on function public.protect_training_request_immutable_fields() from authenticated;

comment on function public.protect_training_request_immutable_fields() is
  'Prevents changes to ownership snapshots, requester_name, request numbers, and created_at after insert, including administrative workflow updates. requester_name is an immutable historical snapshot.';
