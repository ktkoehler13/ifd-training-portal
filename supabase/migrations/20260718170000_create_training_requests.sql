-- IFD Training Portal: training requests, request numbers, and row level security

create or replace function public.current_personnel_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.personnel as p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and p.active = true
  limit 1;
$$;

create table if not exists public.training_request_number_counters (
  request_year integer primary key,
  last_value integer not null default 0,
  constraint training_request_number_counters_last_value_check
    check (last_value >= 0)
);

create or replace function public.generate_training_request_number(
  reference_timestamp timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_year integer := extract(year from coalesce(reference_timestamp, now()))::integer;
  next_value integer;
begin
  insert into public.training_request_number_counters (request_year, last_value)
  values (target_year, 0)
  on conflict (request_year) do nothing;

  update public.training_request_number_counters
  set last_value = last_value + 1
  where request_year = target_year
  returning last_value into next_value;

  return format('IFD-%s-%s', target_year, lpad(next_value::text, 4, '0'));
end;
$$;

create table if not exists public.training_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null,
  requester_personnel_id uuid not null references public.personnel(id),
  requester_badge_number text not null,
  requester_email text not null,
  requester_name text not null,
  training_title text not null,
  course_number text not null default '',
  provider text not null default '',
  description text not null default '',
  location text not null default '',
  start_date date,
  end_date date,
  number_of_days_on_duty integer not null default 0,
  registration_cost numeric(12, 2) not null default 0,
  lodging_cost numeric(12, 2) not null default 0,
  food_cost numeric(12, 2) not null default 0,
  airfare_cost numeric(12, 2) not null default 0,
  rental_vehicle_cost numeric(12, 2) not null default 0,
  other_cost numeric(12, 2) not null default 0,
  mileage_cost numeric(12, 2) not null default 0,
  total_reimbursable_miles numeric(12, 2) not null default 0,
  gsa_mileage_rate numeric(8, 4) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  vehicle_requested boolean not null default false,
  department_vehicle_details text not null default '',
  status text not null default 'draft',
  current_action_role text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_requests_request_number_unique unique (request_number),
  constraint training_requests_status_check check (
    status in (
      'draft',
      'submitted',
      'pending_mto',
      'pending_deputy_chief',
      'approved',
      'denied',
      'cancelled'
    )
  ),
  constraint training_requests_current_action_role_check check (
    current_action_role is null
    or current_action_role in ('mto', 'deputy_chief', 'admin')
  ),
  constraint training_requests_registration_cost_check check (registration_cost >= 0),
  constraint training_requests_lodging_cost_check check (lodging_cost >= 0),
  constraint training_requests_food_cost_check check (food_cost >= 0),
  constraint training_requests_airfare_cost_check check (airfare_cost >= 0),
  constraint training_requests_rental_vehicle_cost_check check (rental_vehicle_cost >= 0),
  constraint training_requests_other_cost_check check (other_cost >= 0),
  constraint training_requests_mileage_cost_check check (mileage_cost >= 0),
  constraint training_requests_total_reimbursable_miles_check
    check (total_reimbursable_miles >= 0),
  constraint training_requests_gsa_mileage_rate_check check (gsa_mileage_rate >= 0),
  constraint training_requests_total_cost_check check (total_cost >= 0),
  constraint training_requests_number_of_days_on_duty_check
    check (number_of_days_on_duty >= 0),
  constraint training_requests_date_range_check check (
    start_date is null
    or end_date is null
    or end_date >= start_date
  ),
  constraint training_requests_submitted_at_check check (
    status = 'draft'
    or submitted_at is not null
  )
);

create index if not exists training_requests_requester_personnel_id_idx
  on public.training_requests (requester_personnel_id);

create index if not exists training_requests_status_idx
  on public.training_requests (status);

create index if not exists training_requests_submitted_at_idx
  on public.training_requests (submitted_at desc nulls last);

create or replace function public.set_training_request_requester_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personnel_id uuid;
begin
  personnel_id := public.current_personnel_id();

  if personnel_id is null then
    raise exception 'Active authenticated personnel record required to create training request';
  end if;

  select p.id, p.badge_number, p.email
  into new.requester_personnel_id, new.requester_badge_number, new.requester_email
  from public.personnel as p
  where p.id = personnel_id
    and p.active = true;

  if new.requester_personnel_id is null then
    raise exception 'Active authenticated personnel record required to create training request';
  end if;

  return new;
end;
$$;

create or replace function public.set_training_request_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_number is null or btrim(new.request_number) = '' then
    new.request_number := public.generate_training_request_number(
      coalesce(new.submitted_at, now())
    );
  end if;

  return new;
end;
$$;

create or replace function public.protect_training_request_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.requester_personnel_id := old.requester_personnel_id;
  new.requester_badge_number := old.requester_badge_number;
  new.requester_email := old.requester_email;
  new.request_number := old.request_number;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists training_requests_before_insert_set_requester on public.training_requests;
create trigger training_requests_before_insert_set_requester
before insert on public.training_requests
for each row
execute function public.set_training_request_requester_identity();

drop trigger if exists training_requests_before_insert_set_request_number on public.training_requests;
create trigger training_requests_before_insert_set_request_number
before insert on public.training_requests
for each row
execute function public.set_training_request_number();

drop trigger if exists training_requests_set_request_number on public.training_requests;
drop trigger if exists training_requests_set_requester_identity on public.training_requests;

drop trigger if exists training_requests_before_update_protect_immutable on public.training_requests;
create trigger training_requests_before_update_protect_immutable
before update on public.training_requests
for each row
execute function public.protect_training_request_immutable_fields();

drop trigger if exists training_requests_set_updated_at on public.training_requests;
create trigger training_requests_set_updated_at
before update on public.training_requests
for each row
execute function public.set_updated_at();

revoke all on function public.current_personnel_id() from public;
revoke all on function public.generate_training_request_number(timestamptz) from public;
revoke all on function public.generate_training_request_number(timestamptz) from authenticated;

grant execute on function public.current_personnel_id() to authenticated;

alter table public.training_requests enable row level security;

drop policy if exists "training_requests_select_own" on public.training_requests;
drop policy if exists "training_requests_select_administrator" on public.training_requests;
drop policy if exists "training_requests_insert_own" on public.training_requests;
drop policy if exists "training_requests_update_own_draft" on public.training_requests;
drop policy if exists "training_requests_submit_own_draft" on public.training_requests;
drop policy if exists "training_requests_administrator_update" on public.training_requests;

create policy "training_requests_select_own"
on public.training_requests
for select
to authenticated
using (
  requester_personnel_id = public.current_personnel_id()
);

create policy "training_requests_select_administrator"
on public.training_requests
for select
to authenticated
using (
  public.is_personnel_administrator()
);

create policy "training_requests_insert_own"
on public.training_requests
for insert
to authenticated
with check (
  public.current_personnel_id() is not null
  and status = 'draft'
  and submitted_at is null
  and current_action_role is null
);

create policy "training_requests_update_own_draft"
on public.training_requests
for update
to authenticated
using (
  requester_personnel_id = public.current_personnel_id()
  and status = 'draft'
)
with check (
  requester_personnel_id = public.current_personnel_id()
  and status = 'draft'
  and submitted_at is null
  and current_action_role is null
);

create policy "training_requests_submit_own_draft"
on public.training_requests
for update
to authenticated
using (
  requester_personnel_id = public.current_personnel_id()
  and status = 'draft'
)
with check (
  requester_personnel_id = public.current_personnel_id()
  and status = 'pending_mto'
  and current_action_role = 'mto'
  and submitted_at is not null
);

create policy "training_requests_administrator_update"
on public.training_requests
for update
to authenticated
using (
  public.is_personnel_administrator()
)
with check (
  public.is_personnel_administrator()
);

comment on table public.training_requests is
  'Shared training request records for authenticated IFD personnel. requester_personnel_id is the stable ownership key; requester_email and requester_badge_number are historical snapshots captured at insert time.';

comment on column public.training_requests.requester_personnel_id is
  'Stable ownership key for the request. Authorization uses this value rather than historical email or badge snapshots.';

comment on column public.training_requests.requester_email is
  'Historical snapshot of the requester email at request creation time.';

comment on column public.training_requests.requester_badge_number is
  'Historical snapshot of the requester badge number at request creation time.';

comment on column public.training_requests.request_number is
  'Database-controlled immutable request identifier such as IFD-2026-0001.';

comment on function public.set_training_request_requester_identity() is
  'Assigns trusted requester ownership fields from the authenticated active personnel record on insert.';

comment on function public.protect_training_request_immutable_fields() is
  'Prevents changes to ownership snapshots, request numbers, and created_at after insert, including administrative workflow updates.';

comment on function public.generate_training_request_number(timestamptz) is
  'Generates sequential request numbers such as IFD-2026-0001 using a locked per-year counter. Callable only from database triggers.';

comment on policy "training_requests_insert_own" on public.training_requests is
  'Authenticated active personnel may create draft requests. Trusted requester identity fields are assigned by a BEFORE INSERT trigger.';

comment on policy "training_requests_update_own_draft" on public.training_requests is
  'Requesters may edit their own draft requests using requester_personnel_id ownership, without requiring historical email or badge snapshots to match current personnel values.';

comment on policy "training_requests_submit_own_draft" on public.training_requests is
  'Requesters may submit their own draft requests into pending MTO review using requester_personnel_id ownership.';
