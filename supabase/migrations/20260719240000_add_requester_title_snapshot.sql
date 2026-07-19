-- Snapshot requester rank on training request insert and index approved schedule queries.

alter table public.training_requests
  add column if not exists requester_title_snapshot text;

alter table public.training_requests
  drop constraint if exists training_requests_requester_title_snapshot_check;

alter table public.training_requests
  add constraint training_requests_requester_title_snapshot_check
  check (
    requester_title_snapshot is null
    or requester_title_snapshot in (
      'firefighter',
      'lieutenant',
      'assistant_chief',
      'deputy_chief',
      'fire_chief'
    )
  );

comment on column public.training_requests.requester_title_snapshot is
  'Immutable department rank snapshot captured when the request is first created. Separate from application authorization role.';

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

  select p.id, p.badge_number, p.email, p.first_name, p.last_name, p.title
  into
    new.requester_personnel_id,
    new.requester_badge_number,
    new.requester_email,
    personnel_first_name,
    personnel_last_name,
    new.requester_title_snapshot
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
  'Assigns trusted requester ownership fields, requester_name snapshot, and requester_title_snapshot from the authenticated active personnel record on insert.';

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
  new.requester_title_snapshot := old.requester_title_snapshot;
  new.created_at := old.created_at;

  if old.status = 'draft'
    and old.request_number is null
    and new.status = 'pending_mto'
    and new.request_number is not null
    and btrim(new.request_number) <> '' then
    null;
  else
    new.request_number := old.request_number;
  end if;

  return new;
end;
$$;

comment on function public.protect_training_request_immutable_fields() is
  'Preserves ownership snapshots, requester_name, requester_title_snapshot, and created_at after insert. Allows request_number to change exactly once when a draft with a null number transitions to pending_mto.';

create index if not exists training_requests_approved_schedule_idx
  on public.training_requests (status, start_date, end_date)
  where status = 'approved';
