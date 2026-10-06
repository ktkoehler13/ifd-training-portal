begin;

alter table public.training_request_actions
  add column expense_changes jsonb;

alter table public.training_request_actions
  drop constraint training_request_actions_action_check;
alter table public.training_request_actions
  add constraint training_request_actions_action_check check (action in (
    'submitted', 'mto_approved', 'mto_returned', 'mto_denied',
    'mto_expenses_updated', 'deputy_chief_approved', 'deputy_chief_returned',
    'deputy_chief_denied', 'resubmitted', 'cancelled'
  ));

comment on column public.training_request_actions.expense_changes is
  'Original and revised expense snapshots, recorded atomically by the MTO expense RPC. Existing action RLS prevents client insertion, editing or deletion.';

create function public.mto_update_training_request_expenses(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_expenses jsonb,
  p_reason text
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  original public.training_requests;
  revised public.training_requests;
  numeric_keys text[] := array[
    'registration_cost', 'lodging_cost', 'food_cost', 'airfare_cost',
    'rental_vehicle_cost', 'other_cost', 'total_reimbursable_miles'
  ];
  snapshot_keys text[];
  field_name text;
  amount numeric;
  expense_description text;
  miles numeric;
  mileage numeric;
  before_values jsonb;
  after_values jsonb;
begin
  select * into actor from public.get_current_personnel_actor();
  if actor.actor_role is distinct from 'mto' then
    raise exception 'Only active MTO personnel may edit estimated expenses';
  end if;
  if actor.actor_name is null or actor.actor_name !~ '[^[:space:]]' then
    raise exception 'Your personnel profile must include a first and last name';
  end if;
  if p_reason is null or p_reason !~ '[^[:space:]]' or length(p_reason) > 2000 then
    raise exception 'Enter a reason for the expense changes (up to 2000 characters)';
  end if;

  select * into original from public.training_requests
  where id = p_request_id for update;
  if original.id is null then
    raise exception 'Training request not found';
  end if;
  if original.status <> 'pending_mto' or original.current_action_role is distinct from 'mto' then
    raise exception 'Expenses may only be edited while awaiting MTO review';
  end if;
  if p_expected_updated_at is null or original.updated_at <> p_expected_updated_at then
    raise exception 'This request has changed. Reload it before editing expenses';
  end if;
  -- Signature reservation also locks this request. An edit must not change the
  -- financial details between reservation and signature completion.
  if exists (
    select 1 from public.training_request_signature_action_reservations
    where training_request_id = original.id
      and consumed_at is null and expires_at > now()
  ) then
    raise exception 'A signature action is in progress. Reload after it completes, or wait for it to expire';
  end if;

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
  if coalesce(expense_description, '') !~ '[^[:space:]]' then expense_description := null; end if;
  if length(expense_description) > 2000 then
    raise exception 'Other Expense description must be 2000 characters or fewer';
  end if;
  -- Historical blank descriptions remain valid when that expense is unchanged.
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

  snapshot_keys := numeric_keys || array[
    'other_expense_description', 'mileage_cost', 'total_cost', 'gsa_mileage_rate'
  ];
  select jsonb_object_agg(key, value) into before_values
  from jsonb_each(to_jsonb(original)) where key = any(snapshot_keys);

  update public.training_requests set
    registration_cost = (p_expenses ->> 'registration_cost')::numeric,
    lodging_cost = (p_expenses ->> 'lodging_cost')::numeric,
    food_cost = (p_expenses ->> 'food_cost')::numeric,
    airfare_cost = (p_expenses ->> 'airfare_cost')::numeric,
    rental_vehicle_cost = (p_expenses ->> 'rental_vehicle_cost')::numeric,
    other_cost = (p_expenses ->> 'other_cost')::numeric,
    other_expense_description = expense_description,
    total_reimbursable_miles = miles,
    mileage_cost = mileage,
    total_cost = (p_expenses ->> 'registration_cost')::numeric
      + (p_expenses ->> 'lodging_cost')::numeric
      + (p_expenses ->> 'food_cost')::numeric
      + (p_expenses ->> 'airfare_cost')::numeric
      + (p_expenses ->> 'rental_vehicle_cost')::numeric
      + (p_expenses ->> 'other_cost')::numeric + mileage
  where id = original.id returning * into revised;

  select jsonb_object_agg(key, value) into after_values
  from jsonb_each(to_jsonb(revised)) where key = any(snapshot_keys);
  if before_values = after_values then
    raise exception 'No expense changes to save';
  end if;

  insert into public.training_request_actions (
    training_request_id, actor_personnel_id, actor_name, actor_badge_number,
    actor_role, action, comments, expense_changes
  ) values (
    original.id, actor.personnel_id, actor.actor_name, actor.badge_number,
    actor.actor_role, 'mto_expenses_updated', btrim(p_reason),
    jsonb_build_object('before', before_values, 'after', after_values)
  );
  return revised;
end;
$$;

-- Compare the version actually reviewed under the same lock used to reserve
-- the signature, so a stale review cannot sign newly edited estimates.
create function public.reserve_training_request_signature_action_for_version(
  p_request_id uuid, p_expected_action text, p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.training_requests;
begin
  perform public.get_current_personnel_actor();
  select * into request_row from public.training_requests
  where id = p_request_id for update;
  if request_row.id is null then raise exception 'Training request not found'; end if;
  if p_expected_updated_at is null or request_row.updated_at <> p_expected_updated_at then
    raise exception 'This request has changed. Reload and review it before signing';
  end if;
  return public.reserve_training_request_signature_action(p_request_id, p_expected_action);
end;
$$;

revoke all on function public.mto_update_training_request_expenses(uuid, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.mto_update_training_request_expenses(uuid, timestamptz, jsonb, text) to authenticated;
revoke all on function public.reserve_training_request_signature_action_for_version(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_training_request_signature_action_for_version(uuid, text, timestamptz) to authenticated;

commit;
