-- Decision changes and later expense edits (D27).
--
-- * MTO or Deputy Chief may switch an Approved request to Denied, or a Denied
--   request to Approved, with a reason and their electronic signature, but only
--   before the course start date (America/New_York).
--   Switching to Approved records the switcher's approval. If the other role
--   has no current approval, the request goes to that role's review queue.
-- * Deputy Chiefs may edit estimated expenses while a request awaits DC review.
-- * MTO or Deputy Chief may edit expenses on an Approved request before the
--   course start date by re-signing; new approved forms are generated.
--
-- Signed records are never altered. Each change is a new signed action that
-- reuses the existing action names, so approved forms use the newest MTO and
-- DC signatures and the email worker's latest-action check needs no change.

begin;

alter table public.training_request_actions
  add column decision_change boolean not null default false;

comment on column public.training_request_actions.decision_change is
  'True when a signed MTO/DC action changed a final Approved/Denied decision (D27).';

alter table public.training_request_actions drop constraint training_request_actions_action_check;
alter table public.training_request_actions add constraint training_request_actions_action_check check (action in (
  'submitted','mto_approved','mto_returned','mto_denied','mto_expenses_updated',
  'deputy_chief_approved','deputy_chief_returned','deputy_chief_denied',
  'deputy_chief_expenses_updated','resubmitted','cancelled',
  'request_deleted','request_restored'
));

alter table public.training_request_signature_action_reservations
  add column kind text not null default 'review',
  add column proposed_expenses jsonb,
  add constraint training_request_signature_action_reservations_kind_check
    check (kind in ('review', 'decision_change', 'expense_resign')),
  add constraint training_request_signature_action_reservations_expenses_check
    check ((kind = 'expense_resign') = (proposed_expenses is not null));

-- True while today's date in Ithaca is before the course start date.
create function public.training_request_course_not_started(p_start_date date)
returns boolean language sql stable set search_path = public as $$
  select p_start_date is not null
    and p_start_date > (now() at time zone 'America/New_York')::date
$$;

-- A role's approval is current when it follows the latest (re)submission,
-- the same role's latest denial, and every later expense change.
create function public.training_request_has_current_approval(p_request_id uuid, p_role text)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.training_request_actions a
    where a.training_request_id = p_request_id
      and a.action = p_role || '_approved'
      and a.created_at > coalesce((select max(s.created_at) from public.training_request_actions s
        where s.training_request_id = p_request_id and s.action in ('submitted', 'resubmitted')), '-infinity')
      and a.created_at > coalesce((select max(d.created_at) from public.training_request_actions d
        where d.training_request_id = p_request_id and d.action = p_role || '_denied'), '-infinity')
      and not exists (select 1 from public.training_request_actions e
        where e.training_request_id = p_request_id and e.expense_changes is not null
          and e.id <> a.id and e.created_at > a.created_at)
  )
$$;

-- Validates proposed estimated expenses against the stored request and returns
-- the complete revised values. Rules match mto_update_training_request_expenses.
create function public.compute_training_request_expense_values(
  original public.training_requests, p_expenses jsonb
)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  numeric_keys text[] := array[
    'registration_cost', 'lodging_cost', 'food_cost', 'airfare_cost',
    'rental_vehicle_cost', 'other_cost', 'total_reimbursable_miles'
  ];
  field_name text;
  amount numeric;
  expense_description text;
  miles numeric;
  mileage numeric;
begin
  if jsonb_typeof(p_expenses) is distinct from 'object' then
    raise exception 'Expense values are required';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_expenses) as keys(key)
    where not (key = any(numeric_keys || array['other_expense_description']))
  ) then
    raise exception 'Only estimated expense fields may be changed';
  end if;
  foreach field_name in array numeric_keys loop
    if jsonb_typeof(p_expenses -> field_name) is distinct from 'number' then
      raise exception 'Enter a numeric value for %', field_name;
    end if;
    amount := (p_expenses ->> field_name)::numeric;
    if amount < 0 or amount > 9999999.99 or amount <> round(amount, 2) then
      raise exception 'Expense amounts and miles must be nonnegative with at most two decimal places';
    end if;
  end loop;
  if jsonb_typeof(p_expenses -> 'other_expense_description') is distinct from 'string' then
    raise exception 'Other Expense description must be text';
  end if;
  expense_description := nullif(btrim(p_expenses ->> 'other_expense_description'), '');
  if length(expense_description) > 2000 then
    raise exception 'Other Expense description must be 2000 characters or fewer';
  end if;
  if (p_expenses ->> 'other_cost')::numeric > 0 and expense_description is null
    and ((p_expenses ->> 'other_cost')::numeric <> original.other_cost
      or coalesce(original.other_expense_description, '') ~ '[^[:space:]]') then
    raise exception 'Describe Other Expense when changing a positive Other Expense';
  end if;

  miles := (p_expenses ->> 'total_reimbursable_miles')::numeric;
  if original.vehicle_requested and miles <> original.total_reimbursable_miles then
    raise exception 'Reimbursable miles cannot be changed when a department vehicle is requested';
  end if;
  mileage := original.mileage_cost;
  if miles <> original.total_reimbursable_miles then
    if miles > 0 and original.gsa_mileage_rate <= 0 then
      raise exception 'The request has no valid stored mileage rate. Return it for correction';
    end if;
    mileage := round(miles * original.gsa_mileage_rate, 2);
  end if;

  return jsonb_build_object(
    'registration_cost', (p_expenses ->> 'registration_cost')::numeric,
    'lodging_cost', (p_expenses ->> 'lodging_cost')::numeric,
    'food_cost', (p_expenses ->> 'food_cost')::numeric,
    'airfare_cost', (p_expenses ->> 'airfare_cost')::numeric,
    'rental_vehicle_cost', (p_expenses ->> 'rental_vehicle_cost')::numeric,
    'other_cost', (p_expenses ->> 'other_cost')::numeric,
    'other_expense_description', expense_description,
    'total_reimbursable_miles', miles,
    'mileage_cost', mileage,
    'total_cost', (p_expenses ->> 'registration_cost')::numeric
      + (p_expenses ->> 'lodging_cost')::numeric
      + (p_expenses ->> 'food_cost')::numeric
      + (p_expenses ->> 'airfare_cost')::numeric
      + (p_expenses ->> 'rental_vehicle_cost')::numeric
      + (p_expenses ->> 'other_cost')::numeric + mileage
  );
end;
$$;

-- Applies validated expense values to a locked request; returns before/after.
create function public.apply_training_request_expense_values(p_request_id uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  original public.training_requests;
  revised public.training_requests;
  snapshot_keys text[] := array[
    'registration_cost', 'lodging_cost', 'food_cost', 'airfare_cost',
    'rental_vehicle_cost', 'other_cost', 'total_reimbursable_miles',
    'other_expense_description', 'mileage_cost', 'total_cost', 'gsa_mileage_rate'
  ];
  before_values jsonb;
  after_values jsonb;
begin
  select * into original from public.training_requests where id = p_request_id for update;
  select jsonb_object_agg(key, value) into before_values
  from jsonb_each(to_jsonb(original)) where key = any(snapshot_keys);

  update public.training_requests set
    registration_cost = (p_values ->> 'registration_cost')::numeric,
    lodging_cost = (p_values ->> 'lodging_cost')::numeric,
    food_cost = (p_values ->> 'food_cost')::numeric,
    airfare_cost = (p_values ->> 'airfare_cost')::numeric,
    rental_vehicle_cost = (p_values ->> 'rental_vehicle_cost')::numeric,
    other_cost = (p_values ->> 'other_cost')::numeric,
    other_expense_description = p_values ->> 'other_expense_description',
    total_reimbursable_miles = (p_values ->> 'total_reimbursable_miles')::numeric,
    mileage_cost = (p_values ->> 'mileage_cost')::numeric,
    total_cost = (p_values ->> 'total_cost')::numeric
  where id = p_request_id returning * into revised;

  select jsonb_object_agg(key, value) into after_values
  from jsonb_each(to_jsonb(revised)) where key = any(snapshot_keys);
  if before_values = after_values then
    raise exception 'No expense changes to save';
  end if;
  return jsonb_build_object('before', before_values, 'after', after_values);
end;
$$;

-- Deputy Chief expense edits while the request awaits Deputy Chief review.
create function public.deputy_update_training_request_expenses(
  p_request_id uuid, p_expected_updated_at timestamptz, p_expenses jsonb, p_reason text
)
returns public.training_requests
language plpgsql security definer set search_path = public as $$
declare
  actor record;
  original public.training_requests;
  changes jsonb;
begin
  select * into actor from public.get_current_personnel_actor();
  if actor.actor_role is distinct from 'deputy_chief' then
    raise exception 'Only active Deputy Chief personnel may edit estimated expenses at this step';
  end if;
  if actor.actor_name is null or actor.actor_name !~ '[^[:space:]]' then
    raise exception 'Your personnel profile must include a first and last name';
  end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' or length(p_reason) > 2000 then
    raise exception 'Enter a reason for the expense changes (up to 2000 characters)';
  end if;
  select * into original from public.training_requests where id = p_request_id for update;
  if original.id is null or original.deleted_at is not null then
    raise exception 'Training request not found';
  end if;
  if original.status <> 'pending_deputy_chief' or original.current_action_role is distinct from 'deputy_chief' then
    raise exception 'Expenses may only be edited here while awaiting Deputy Chief review';
  end if;
  if p_expected_updated_at is null or original.updated_at <> p_expected_updated_at then
    raise exception 'This request has changed. Reload it before editing expenses';
  end if;
  if exists (select 1 from public.training_request_signature_action_reservations
    where training_request_id = original.id and consumed_at is null and expires_at > now()) then
    raise exception 'A signature action is in progress. Reload after it completes, or wait for it to expire';
  end if;

  changes := public.apply_training_request_expense_values(
    original.id, public.compute_training_request_expense_values(original, p_expenses));
  insert into public.training_request_actions (
    training_request_id, actor_personnel_id, actor_name, actor_badge_number,
    actor_role, action, comments, expense_changes
  ) values (
    original.id, actor.personnel_id, actor.actor_name, actor.badge_number,
    actor.actor_role, 'deputy_chief_expenses_updated', btrim(p_reason), changes
  );
  select * into original from public.training_requests where id = p_request_id;
  return original;
end;
$$;

-- Reserves a signed decision change ('deny' or 'approve') or approved-expense
-- re-signature ('expenses') for the version the reviewer actually saw.
create function public.reserve_training_request_decision_change(
  p_request_id uuid, p_change text, p_expected_updated_at timestamptz, p_expenses jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor record;
  request_row public.training_requests;
  expected text;
  reservation_kind text := 'decision_change';
  reservation_id uuid;
begin
  select * into actor from public.get_current_personnel_actor();
  if actor.actor_role not in ('mto', 'deputy_chief') then
    raise exception 'Only active MTO or Deputy Chief personnel may change a decision or approved expenses';
  end if;
  select * into request_row from public.training_requests where id = p_request_id for update;
  if request_row.id is null or request_row.deleted_at is not null then
    raise exception 'Training request not found';
  end if;
  if p_expected_updated_at is null or request_row.updated_at <> p_expected_updated_at then
    raise exception 'This request has changed. Reload and review it before signing';
  end if;
  if not public.training_request_course_not_started(request_row.start_date) then
    raise exception 'Decisions and approved expenses can only be changed before the course start date';
  end if;

  if p_change = 'deny' then
    if request_row.status <> 'approved' then raise exception 'Only an approved request can be changed to Denied'; end if;
    expected := actor.actor_role || '_denied';
  elsif p_change = 'approve' then
    if request_row.status <> 'denied' then raise exception 'Only a denied request can be changed to Approved'; end if;
    expected := actor.actor_role || '_approved';
  elsif p_change = 'expenses' then
    if request_row.status <> 'approved' then raise exception 'Only an approved request''s expenses can be re-signed'; end if;
    perform public.compute_training_request_expense_values(request_row, p_expenses);
    expected := actor.actor_role || '_approved';
    reservation_kind := 'expense_resign';
  else
    raise exception 'Unsupported decision change';
  end if;
  if reservation_kind <> 'expense_resign' and p_expenses is not null then
    raise exception 'Expense values are only accepted when re-signing approved expenses';
  end if;

  if exists (select 1 from public.training_request_signature_action_reservations
    where training_request_id = request_row.id and consumed_at is null and expires_at > now()) then
    raise exception 'A signature action is in progress. Reload after it completes, or wait for it to expire';
  end if;
  perform public.require_personnel_signature_for_workflow_action(actor.personnel_id);
  if actor.actor_name is null or btrim(actor.actor_name) = '' then
    raise exception 'Your personnel profile must include a first and last name before performing this action';
  end if;

  insert into public.training_request_signature_action_reservations (
    training_request_id, actor_personnel_id, actor_name, actor_badge_number,
    actor_role, actor_auth_user_id, expected_action, kind, proposed_expenses
  ) values (
    request_row.id, actor.personnel_id, actor.actor_name, actor.badge_number,
    actor.actor_role, auth.uid(), expected, reservation_kind,
    case when reservation_kind = 'expense_resign' then p_expenses end
  ) returning id into reservation_id;
  return reservation_id;
end;
$$;

-- Creates the City Authorization task when an approval is finalized by an
-- action other than a Deputy Chief approval (whose trigger already does this).
create function public.ensure_city_authorization_task(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare dc_action uuid;
begin
  insert into public.training_request_city_authorizations(request_id) values (p_request_id)
  on conflict do nothing;
  if found then
    select id into dc_action from public.training_request_actions
    where training_request_id = p_request_id and action = 'deputy_chief_approved'
    order by created_at desc, id desc limit 1;
    perform public.enqueue_office_notifications(p_request_id, dc_action, null, 'office_city_authorization');
  end if;
end;
$$;

-- Replaces the 20260718220000 version: adds decision changes, approved-expense
-- re-signatures, and MTO approval finalizing when a current DC approval exists.
create or replace function public.complete_training_request_signature_action(
  p_reservation_id uuid,
  p_comments text,
  p_electronic_signature_confirmed boolean,
  p_signature_storage_bucket text,
  p_signature_storage_path text,
  p_signature_sha256 text,
  p_signature_mime_type text,
  p_signature_file_size_bytes bigint
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.training_request_signature_action_reservations;
  request_row public.training_requests;
  action_row public.training_request_actions;
  notification_event_type text;
  action_role text;
  other_role text;
  next_status text;
  changes jsonb;
begin
  if coalesce(p_electronic_signature_confirmed, false) is distinct from true then
    raise exception 'Electronic signature acknowledgment is required to complete this action';
  end if;

  select * into reservation_row
  from public.training_request_signature_action_reservations
  where id = p_reservation_id for update;
  if reservation_row.id is null then
    raise exception 'Signature action reservation not found';
  end if;
  if reservation_row.consumed_at is not null then
    raise exception 'Signature action reservation has already been consumed';
  end if;
  if reservation_row.expires_at <= now() then
    raise exception 'Signature action reservation has expired';
  end if;
  if reservation_row.actor_name is null or btrim(reservation_row.actor_name) = '' then
    raise exception 'Signature action reservation is missing reviewer identity';
  end if;

  select * into request_row from public.training_requests
  where id = reservation_row.training_request_id for update;
  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  perform public.validate_signature_snapshot_metadata(
    reservation_row.training_request_id, reservation_row.id,
    p_signature_storage_bucket, p_signature_storage_path, p_signature_sha256,
    p_signature_mime_type, p_signature_file_size_bytes
  );

  action_role := case when reservation_row.expected_action like 'mto_%' then 'mto' else 'deputy_chief' end;
  other_role := case when action_role = 'mto' then 'deputy_chief' else 'mto' end;
  if reservation_row.actor_role <> action_role then
    raise exception 'Reviewer role does not match this signature action';
  end if;

  if reservation_row.kind = 'review' then
    if action_role = 'mto' and (request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto') then
      raise exception 'Training request is not awaiting MTO review';
    end if;
    if action_role = 'deputy_chief' and (request_row.status <> 'pending_deputy_chief'
      or request_row.current_action_role <> 'deputy_chief') then
      raise exception 'Training request is not awaiting Deputy Chief review';
    end if;

    if reservation_row.expected_action like '%_denied' then
      perform public.require_training_request_action_comments(p_comments, 'Deny request');
      next_status := 'denied';
    elsif action_role = 'deputy_chief' or public.training_request_has_current_approval(request_row.id, 'deputy_chief') then
      next_status := 'approved';
    else
      next_status := 'pending_deputy_chief';
    end if;
  else
    if request_row.deleted_at is not null then
      raise exception 'Training request not found';
    end if;
    if not public.training_request_course_not_started(request_row.start_date) then
      raise exception 'Decisions and approved expenses can only be changed before the course start date';
    end if;
    if p_comments is null or btrim(p_comments) = '' or length(p_comments) > 2000 then
      raise exception 'Enter a reason for this change (up to 2000 characters)';
    end if;

    if reservation_row.kind = 'expense_resign' then
      if request_row.status <> 'approved' then
        raise exception 'Only an approved request''s expenses can be re-signed';
      end if;
      changes := public.apply_training_request_expense_values(request_row.id,
        public.compute_training_request_expense_values(request_row, reservation_row.proposed_expenses));
      next_status := 'approved';
    elsif reservation_row.expected_action like '%_denied' then
      if request_row.status <> 'approved' then
        raise exception 'Only an approved request can be changed to Denied';
      end if;
      next_status := 'denied';
    else
      if request_row.status <> 'denied' then
        raise exception 'Only a denied request can be changed to Approved';
      end if;
      next_status := case when public.training_request_has_current_approval(request_row.id, other_role)
        then 'approved' else 'pending_' || other_role end;
    end if;
  end if;

  update public.training_requests set
    status = next_status,
    current_action_role = case when next_status like 'pending_%' then substr(next_status, 9) end
  where id = request_row.id
  returning * into request_row;

  action_row := public.insert_training_request_signature_action(
    reservation_row.id, request_row.id, reservation_row.expected_action,
    reservation_row.actor_personnel_id, reservation_row.actor_name,
    reservation_row.actor_badge_number, reservation_row.actor_role,
    p_comments, reservation_row.actor_name, now(), true,
    p_signature_storage_bucket, p_signature_storage_path, p_signature_sha256,
    p_signature_mime_type, p_signature_file_size_bytes
  );
  if reservation_row.kind <> 'review' then
    update public.training_request_actions set
      decision_change = (reservation_row.kind = 'decision_change'),
      expense_changes = changes
    where id = action_row.id
    returning * into action_row;
  end if;

  update public.training_request_signature_action_reservations
  set consumed_at = now() where id = reservation_row.id;

  notification_event_type := next_status;
  perform public.enqueue_training_request_notifications(request_row.id, action_row.id, notification_event_type);

  if next_status = 'approved' then
    perform public.upsert_training_request_packet_pending(request_row.id);
    if action_role = 'mto' then
      perform public.ensure_city_authorization_task(request_row.id);
    end if;
  end if;

  return request_row;
end;
$$;

revoke all on function public.training_request_course_not_started(date) from public, anon;
grant execute on function public.training_request_course_not_started(date) to authenticated;
revoke all on function public.training_request_has_current_approval(uuid, text) from public, anon, authenticated;
revoke all on function public.compute_training_request_expense_values(public.training_requests, jsonb) from public, anon, authenticated;
revoke all on function public.apply_training_request_expense_values(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ensure_city_authorization_task(uuid) from public, anon, authenticated;
revoke all on function public.deputy_update_training_request_expenses(uuid, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.deputy_update_training_request_expenses(uuid, timestamptz, jsonb, text) to authenticated;
revoke all on function public.reserve_training_request_decision_change(uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_training_request_decision_change(uuid, text, timestamptz, jsonb) to authenticated;

commit;
