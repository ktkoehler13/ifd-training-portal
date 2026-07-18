-- Human-readable training request numbers assigned at submission time.

update public.training_requests
set request_number = null
where status = 'draft';

alter table public.training_requests
  alter column request_number drop not null;

alter table public.training_requests
  drop constraint if exists training_requests_request_number_presence_check;

alter table public.training_requests
  add constraint training_requests_request_number_presence_check check (
    (
      status = 'draft'
      and request_number is null
    )
    or (
      status <> 'draft'
      and request_number is not null
      and btrim(request_number) <> ''
    )
  );

drop trigger if exists training_requests_before_insert_set_request_number on public.training_requests;

drop function if exists public.set_training_request_number();
drop function if exists public.generate_training_request_number(timestamptz);

create or replace function public.sanitize_request_number_segment(
  segment_value text,
  fallback_value text default 'Unknown'
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text;
begin
  cleaned := coalesce(segment_value, '');
  cleaned := regexp_replace(cleaned, '[[:cntrl:]]', '', 'g');
  cleaned := regexp_replace(cleaned, '[/\\]', '', 'g');
  cleaned := regexp_replace(cleaned, '[^[:alnum:][:space:]\-''(),]', '', 'g');
  cleaned := regexp_replace(btrim(cleaned), '\s+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '[\.[:space:]]+$', '', 'g');

  if cleaned is null or btrim(cleaned) = '' then
    return fallback_value;
  end if;

  return cleaned;
end;
$$;

create or replace function public.next_training_request_sequence(
  target_year integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  insert into public.training_request_number_counters (request_year, last_value)
  values (target_year, 0)
  on conflict (request_year) do nothing;

  update public.training_request_number_counters
  set last_value = last_value + 1
  where request_year = target_year
  returning last_value into next_value;

  return next_value;
end;
$$;

create or replace function public.build_training_request_number(
  requester_name text,
  training_title text,
  submission_timestamp timestamptz,
  sequence_value integer
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  name_parts text[];
  first_name text;
  last_name text;
  first_initial text;
  last_name_segment text;
  course_segment text;
  target_year integer;
begin
  name_parts := regexp_split_to_array(
    btrim(coalesce(requester_name, '')),
    '\s+'
  );

  if name_parts is null
    or array_length(name_parts, 1) is null
    or array_length(name_parts, 1) = 0 then
    last_name_segment := 'Unknown';
    first_initial := 'U';
  elsif array_length(name_parts, 1) = 1 then
    last_name_segment := public.sanitize_request_number_segment(name_parts[1], 'Unknown');
    first_initial := upper(
      left(public.sanitize_request_number_segment(name_parts[1], 'U'), 1)
    );
  else
    first_name := name_parts[1];
    last_name := name_parts[array_length(name_parts, 1)];
    last_name_segment := public.sanitize_request_number_segment(last_name, 'Unknown');
    first_initial := upper(
      left(public.sanitize_request_number_segment(first_name, 'U'), 1)
    );
  end if;

  course_segment := public.sanitize_request_number_segment(training_title, 'Training');
  target_year := extract(
    year from coalesce(submission_timestamp, now())
  )::integer;

  return format(
    '%s, %s, %s, %s.%s',
    last_name_segment,
    first_initial,
    course_segment,
    target_year,
    sequence_value::text
  );
end;
$$;

create or replace function public.generate_training_request_number_for_request(
  p_request public.training_requests,
  p_submitted_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_year integer;
  sequence_value integer;
begin
  target_year := extract(
    year from coalesce(p_submitted_at, now())
  )::integer;
  sequence_value := public.next_training_request_sequence(target_year);

  return public.build_training_request_number(
    p_request.requester_name,
    p_request.training_title,
    p_submitted_at,
    sequence_value
  );
end;
$$;

create or replace function public.submit_training_request(p_request_id uuid)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  personnel_id uuid;
  request_row public.training_requests;
  action_row public.training_request_actions;
  submission_timestamp timestamptz := now();
  assigned_request_number text;
begin
  personnel_id := public.current_personnel_id();

  if personnel_id is null then
    raise exception 'Active authenticated personnel record required';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.requester_personnel_id <> personnel_id then
    raise exception 'Only the requester may submit this training request';
  end if;

  if request_row.status <> 'draft' then
    raise exception 'Only draft requests may be submitted';
  end if;

  if request_row.request_number is not null then
    raise exception 'Draft requests must not have a request number before submission';
  end if;

  if request_row.requester_name is null or btrim(request_row.requester_name) = '' then
    raise exception 'Your personnel profile must include a first and last name before creating a training request';
  end if;

  if request_row.training_title is null or btrim(request_row.training_title) = '' then
    raise exception 'Training title is required before submitting a training request';
  end if;

  assigned_request_number := public.generate_training_request_number_for_request(
    request_row,
    submission_timestamp
  );

  update public.training_requests
  set
    request_number = assigned_request_number,
    status = 'pending_mto',
    current_action_role = 'mto',
    submitted_at = submission_timestamp
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'submitted'
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'pending_mto'
  );

  return request_row;
end;
$$;

create or replace function public.build_training_request_notification_copy(
  p_event_type text,
  p_request public.training_requests
)
returns table (
  subject text,
  message_text text
)
language plpgsql
immutable
set search_path = public
as $$
begin
  case p_event_type
    when 'pending_mto' then
      return query
      select
        format('Training request %s requires MTO review', p_request.request_number),
        format(
          'Training request %s from %s requires MTO review.%sTraining: %s%sCurrent status: Pending MTO Review%sAction required: Review and sign as MTO.',
          p_request.request_number,
          p_request.requester_name,
          E'\n\n',
          p_request.training_title,
          E'\n',
          E'\n'
        );
    when 'pending_deputy_chief' then
      return query
      select
        format(
          'Training request %s requires Deputy Chief review',
          p_request.request_number
        ),
        format(
          'Training request %s from %s requires Deputy Chief review.%sTraining: %s%sCurrent status: Pending Deputy Chief Review%sAction required: Review and sign as Deputy Chief.',
          p_request.request_number,
          p_request.requester_name,
          E'\n\n',
          p_request.training_title,
          E'\n',
          E'\n'
        );
    when 'returned_for_correction' then
      return query
      select
        format(
          'Training request %s returned for correction',
          p_request.request_number
        ),
        format(
          'Training request %s has been returned for correction.%sTraining: %s%sCurrent status: Returned for Correction%sAction required: Edit and resubmit your request.',
          p_request.request_number,
          E'\n\n',
          p_request.training_title,
          E'\n',
          E'\n'
        );
    when 'denied' then
      return query
      select
        format('Training request %s denied', p_request.request_number),
        format(
          'Training request %s has been denied.%sTraining: %s%sCurrent status: Denied',
          p_request.request_number,
          E'\n\n',
          p_request.training_title,
          E'\n'
        );
    when 'approved' then
      return query
      select
        format('Training request %s approved', p_request.request_number),
        format(
          'Training request %s has been approved.%sTraining: %s%sCurrent status: Approved',
          p_request.request_number,
          E'\n\n',
          p_request.training_title,
          E'\n'
        );
    else
      raise exception 'Unsupported notification event type: %', p_event_type;
  end case;
end;
$$;

revoke all on function public.sanitize_request_number_segment(text, text) from public;
revoke all on function public.sanitize_request_number_segment(text, text) from anon;
revoke all on function public.sanitize_request_number_segment(text, text) from authenticated;
revoke all on function public.next_training_request_sequence(integer) from public;
revoke all on function public.next_training_request_sequence(integer) from anon;
revoke all on function public.next_training_request_sequence(integer) from authenticated;
revoke all on function public.build_training_request_number(text, text, timestamptz, integer) from public;
revoke all on function public.build_training_request_number(text, text, timestamptz, integer) from anon;
revoke all on function public.build_training_request_number(text, text, timestamptz, integer) from authenticated;
revoke all on function public.generate_training_request_number_for_request(public.training_requests, timestamptz) from public;
revoke all on function public.generate_training_request_number_for_request(public.training_requests, timestamptz) from anon;
revoke all on function public.generate_training_request_number_for_request(public.training_requests, timestamptz) from authenticated;

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

revoke all on function public.protect_training_request_immutable_fields() from public;
revoke all on function public.protect_training_request_immutable_fields() from anon;
revoke all on function public.protect_training_request_immutable_fields() from authenticated;

comment on column public.training_requests.request_number is
  'Database-controlled immutable request identifier such as Koehler, K, Fire Officer I, 2026.1. Assigned at submission; drafts remain null until submitted.';

comment on function public.next_training_request_sequence(integer) is
  'Returns the next department-wide sequence value for a calendar year using the locked yearly counter table.';

comment on function public.build_training_request_number(text, text, timestamptz, integer) is
  'Builds a human-readable request identifier from trusted requester name, training title, submission year, and yearly sequence.';

comment on function public.generate_training_request_number_for_request(public.training_requests, timestamptz) is
  'Assigns the next yearly sequence and builds the final human-readable request number from trusted request row snapshots. Callable only from trusted workflow functions.';

comment on function public.submit_training_request(uuid) is
  'Submits a draft request, assigns the final human-readable request number atomically, records submitted action history, and enqueues MTO notifications.';

comment on function public.protect_training_request_immutable_fields() is
  'Preserves ownership snapshots and created_at after insert. Allows request_number to change exactly once when a draft with a null number transitions to pending_mto; all later updates keep the assigned number immutable.';

-- Existing IFD-format submitted records are preserved unchanged.
-- Optional disposable test cleanup (run manually, not part of this migration):
-- delete from public.training_requests where request_number like 'IFD-%';
