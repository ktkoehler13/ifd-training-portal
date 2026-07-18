-- IFD Training Portal: approval workflow, action history, and notification outbox

alter table public.training_requests
  drop constraint if exists training_requests_status_check;

alter table public.training_requests
  add constraint training_requests_status_check check (
    status in (
      'draft',
      'submitted',
      'pending_mto',
      'pending_deputy_chief',
      'returned_for_correction',
      'approved',
      'denied',
      'cancelled'
    )
  );

alter table public.training_requests
  drop constraint if exists training_requests_current_action_role_check;

alter table public.training_requests
  add constraint training_requests_current_action_role_check check (
    current_action_role is null
    or current_action_role in ('firefighter', 'mto', 'deputy_chief', 'admin')
  );

create index if not exists training_requests_current_action_role_status_idx
  on public.training_requests (current_action_role, status);

create table if not exists public.training_request_actions (
  id uuid primary key default gen_random_uuid(),
  training_request_id uuid not null references public.training_requests(id) on delete cascade,
  actor_personnel_id uuid not null references public.personnel(id),
  actor_name text not null,
  actor_badge_number text not null,
  actor_role text not null,
  action text not null,
  comments text,
  signature_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_request_actions_actor_role_check check (
    actor_role in ('firefighter', 'mto', 'deputy_chief', 'admin')
  ),
  constraint training_request_actions_action_check check (
    action in (
      'submitted',
      'mto_approved',
      'mto_returned',
      'mto_denied',
      'deputy_chief_approved',
      'deputy_chief_returned',
      'deputy_chief_denied',
      'resubmitted',
      'cancelled'
    )
  )
);

create index if not exists training_request_actions_training_request_id_idx
  on public.training_request_actions (training_request_id, created_at);

create table if not exists public.training_request_notifications (
  id uuid primary key default gen_random_uuid(),
  training_request_id uuid not null references public.training_requests(id) on delete cascade,
  source_action_id uuid not null references public.training_request_actions(id) on delete cascade,
  event_type text not null,
  recipient_email text not null,
  recipient_personnel_id uuid references public.personnel(id),
  subject text not null,
  message_text text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_request_notifications_status_check check (
    status in ('pending', 'processing', 'sent', 'failed')
  ),
  constraint training_request_notifications_event_type_check check (
    event_type in (
      'pending_mto',
      'pending_deputy_chief',
      'returned_for_correction',
      'denied',
      'approved'
    )
  ),
  constraint training_request_notifications_attempts_check check (attempts >= 0),
  constraint training_request_notifications_unique_transition_recipient unique (
    source_action_id,
    event_type,
    recipient_email
  )
);

create index if not exists training_request_notifications_status_created_at_idx
  on public.training_request_notifications (status, created_at);

alter table public.training_request_actions enable row level security;
alter table public.training_request_notifications enable row level security;

revoke all on table public.training_request_notifications from public;
revoke all on table public.training_request_notifications from anon;
revoke all on table public.training_request_notifications from authenticated;

create or replace function public.format_personnel_full_name(
  personnel_first_name text,
  personnel_last_name text
)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    btrim(
      coalesce(personnel_first_name, '') || ' ' || coalesce(personnel_last_name, '')
    ),
    ''
  );
$$;

create or replace function public.get_current_personnel_actor()
returns table (
  personnel_id uuid,
  badge_number text,
  actor_name text,
  actor_role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_personnel_id uuid;
  resolved_badge_number text;
  resolved_actor_name text;
  resolved_actor_role text;
begin
  resolved_personnel_id := public.current_personnel_id();

  if resolved_personnel_id is null then
    raise exception 'Active authenticated personnel record required';
  end if;

  select
    p.badge_number,
    public.format_personnel_full_name(p.first_name, p.last_name),
    p.role
  into
    resolved_badge_number,
    resolved_actor_name,
    resolved_actor_role
  from public.personnel as p
  where p.id = resolved_personnel_id
    and p.active = true;

  if resolved_actor_role is null then
    raise exception 'Active authenticated personnel record required';
  end if;

  return query
  select
    resolved_personnel_id,
    resolved_badge_number,
    resolved_actor_name,
    resolved_actor_role;
end;
$$;

create or replace function public.require_training_request_action_comments(
  action_comments text,
  action_label text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if action_comments is null or btrim(action_comments) = '' then
    raise exception '% requires comments', action_label;
  end if;
end;
$$;

create or replace function public.insert_training_request_action(
  p_training_request_id uuid,
  p_action text,
  p_comments text default null,
  p_signature_name text default null,
  p_signed_at timestamptz default null
)
returns public.training_request_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  inserted_action public.training_request_actions;
begin
  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_name is null then
    raise exception 'Your personnel profile must include a first and last name before performing this action';
  end if;

  insert into public.training_request_actions (
    training_request_id,
    actor_personnel_id,
    actor_name,
    actor_badge_number,
    actor_role,
    action,
    comments,
    signature_name,
    signed_at
  )
  values (
    p_training_request_id,
    actor.personnel_id,
    actor.actor_name,
    actor.badge_number,
    actor.actor_role,
    p_action,
    nullif(btrim(coalesce(p_comments, '')), ''),
    p_signature_name,
    p_signed_at
  )
  returning * into inserted_action;

  return inserted_action;
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
        format('IFD training request %s requires MTO review', p_request.request_number),
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
        format('IFD training request %s requires Deputy Chief review', p_request.request_number),
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
        format('IFD training request %s returned for correction', p_request.request_number),
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
        format('IFD training request %s denied', p_request.request_number),
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
        format('IFD training request %s approved', p_request.request_number),
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

create or replace function public.enqueue_training_request_notifications(
  p_training_request_id uuid,
  p_source_action_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.training_requests;
  notification_copy record;
begin
  select *
  into request_row
  from public.training_requests
  where id = p_training_request_id;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  select *
  into notification_copy
  from public.build_training_request_notification_copy(p_event_type, request_row);

  if p_event_type = 'pending_mto' then
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    select
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      p.email,
      p.id,
      notification_copy.subject,
      notification_copy.message_text
    from public.personnel as p
    where p.active = true
      and p.role = 'mto'
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  elsif p_event_type = 'pending_deputy_chief' then
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    select
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      p.email,
      p.id,
      notification_copy.subject,
      notification_copy.message_text
    from public.personnel as p
    where p.active = true
      and p.role = 'deputy_chief'
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  else
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    values (
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      coalesce(
        (
          select p.email
          from public.personnel as p
          where p.id = request_row.requester_personnel_id
            and p.active = true
          limit 1
        ),
        request_row.requester_email
      ),
      request_row.requester_personnel_id,
      notification_copy.subject,
      notification_copy.message_text
    )
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  end if;
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

  update public.training_requests
  set
    status = 'pending_mto',
    current_action_role = 'mto',
    submitted_at = coalesce(submitted_at, now())
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

create or replace function public.resubmit_training_request(p_request_id uuid)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  personnel_id uuid;
  request_row public.training_requests;
  action_row public.training_request_actions;
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
    raise exception 'Only the requester may resubmit this training request';
  end if;

  if request_row.status <> 'returned_for_correction' then
    raise exception 'Only requests returned for correction may be resubmitted';
  end if;

  update public.training_requests
  set
    status = 'pending_mto',
    current_action_role = 'mto'
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'resubmitted'
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'pending_mto'
  );

  return request_row;
end;
$$;

create or replace function public.mto_approve_training_request(
  p_request_id uuid,
  p_comments text default null
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'mto' then
    raise exception 'Only active MTO personnel may approve at the MTO review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto' then
    raise exception 'Training request is not awaiting MTO review';
  end if;

  update public.training_requests
  set
    status = 'pending_deputy_chief',
    current_action_role = 'deputy_chief'
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'mto_approved',
    p_comments,
    actor.actor_name,
    now()
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'pending_deputy_chief'
  );

  return request_row;
end;
$$;

create or replace function public.mto_return_training_request(
  p_request_id uuid,
  p_comments text
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  perform public.require_training_request_action_comments(
    p_comments,
    'Return for correction'
  );

  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'mto' then
    raise exception 'Only active MTO personnel may return requests at the MTO review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto' then
    raise exception 'Training request is not awaiting MTO review';
  end if;

  update public.training_requests
  set
    status = 'returned_for_correction',
    current_action_role = 'firefighter'
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'mto_returned',
    p_comments
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'returned_for_correction'
  );

  return request_row;
end;
$$;

create or replace function public.mto_deny_training_request(
  p_request_id uuid,
  p_comments text
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  perform public.require_training_request_action_comments(
    p_comments,
    'Deny request'
  );

  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'mto' then
    raise exception 'Only active MTO personnel may deny requests at the MTO review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto' then
    raise exception 'Training request is not awaiting MTO review';
  end if;

  update public.training_requests
  set
    status = 'denied',
    current_action_role = null
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'mto_denied',
    p_comments
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'denied'
  );

  return request_row;
end;
$$;

create or replace function public.deputy_approve_training_request(
  p_request_id uuid,
  p_comments text default null
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'deputy_chief' then
    raise exception 'Only active Deputy Chief personnel may approve at the Deputy Chief review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_deputy_chief'
    or request_row.current_action_role <> 'deputy_chief' then
    raise exception 'Training request is not awaiting Deputy Chief review';
  end if;

  update public.training_requests
  set
    status = 'approved',
    current_action_role = null
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'deputy_chief_approved',
    p_comments,
    actor.actor_name,
    now()
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'approved'
  );

  return request_row;
end;
$$;

create or replace function public.deputy_return_training_request(
  p_request_id uuid,
  p_comments text
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  perform public.require_training_request_action_comments(
    p_comments,
    'Return for correction'
  );

  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'deputy_chief' then
    raise exception 'Only active Deputy Chief personnel may return requests at the Deputy Chief review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_deputy_chief'
    or request_row.current_action_role <> 'deputy_chief' then
    raise exception 'Training request is not awaiting Deputy Chief review';
  end if;

  update public.training_requests
  set
    status = 'returned_for_correction',
    current_action_role = 'firefighter'
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'deputy_chief_returned',
    p_comments
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'returned_for_correction'
  );

  return request_row;
end;
$$;

create or replace function public.deputy_deny_training_request(
  p_request_id uuid,
  p_comments text
)
returns public.training_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  action_row public.training_request_actions;
begin
  perform public.require_training_request_action_comments(
    p_comments,
    'Deny request'
  );

  select *
  into actor
  from public.get_current_personnel_actor();

  if actor.actor_role <> 'deputy_chief' then
    raise exception 'Only active Deputy Chief personnel may deny requests at the Deputy Chief review step';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'pending_deputy_chief'
    or request_row.current_action_role <> 'deputy_chief' then
    raise exception 'Training request is not awaiting Deputy Chief review';
  end if;

  update public.training_requests
  set
    status = 'denied',
    current_action_role = null
  where id = p_request_id
  returning * into request_row;

  action_row := public.insert_training_request_action(
    p_request_id,
    'deputy_chief_denied',
    p_comments
  );

  perform public.enqueue_training_request_notifications(
    p_request_id,
    action_row.id,
    'denied'
  );

  return request_row;
end;
$$;

alter table public.training_request_notifications
  add column if not exists next_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz;

update public.training_request_notifications
set next_attempt_at = coalesce(next_attempt_at, created_at, now())
where next_attempt_at is null;

alter table public.training_request_notifications
  alter column next_attempt_at set default now();

alter table public.training_request_notifications
  alter column next_attempt_at set not null;

create index if not exists training_request_notifications_claim_idx
  on public.training_request_notifications (status, next_attempt_at, created_at);

create or replace function public.claim_pending_training_request_notifications(
  batch_size integer default 25
)
returns setof public.training_request_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      n.id,
      case
        when n.status = 'processing' then false
        else true
      end as should_increment_attempts
    from public.training_request_notifications as n
    where (
      (
        n.status = 'pending'
        and n.next_attempt_at <= now()
      )
      or (
        n.status = 'failed'
        and n.attempts < 5
        and n.next_attempt_at <= now()
      )
      or (
        n.status = 'processing'
        and n.processing_started_at is not null
        and n.processing_started_at <= now() - interval '15 minutes'
        and n.attempts < 5
      )
    )
    order by n.next_attempt_at, n.created_at
    limit greatest(batch_size, 1)
    for update skip locked
  )
  update public.training_request_notifications as n
  set
    status = 'processing',
    processing_started_at = now(),
    attempts = case
      when c.should_increment_attempts then n.attempts + 1
      else n.attempts
    end
  from candidates as c
  where n.id = c.id
  returning n.*;
end;
$$;

drop policy if exists "training_requests_submit_own_draft" on public.training_requests;
drop policy if exists "training_requests_administrator_update" on public.training_requests;
drop policy if exists "training_requests_update_own_returned" on public.training_requests;

create policy "training_requests_update_own_returned"
on public.training_requests
for update
to authenticated
using (
  requester_personnel_id = public.current_personnel_id()
  and status = 'returned_for_correction'
)
with check (
  requester_personnel_id = public.current_personnel_id()
  and status = 'returned_for_correction'
  and current_action_role = 'firefighter'
);

drop policy if exists "training_request_actions_select_own" on public.training_request_actions;
drop policy if exists "training_request_actions_select_administrator" on public.training_request_actions;
drop policy if exists "training_request_actions_insert" on public.training_request_actions;
drop policy if exists "training_request_actions_update" on public.training_request_actions;
drop policy if exists "training_request_actions_delete" on public.training_request_actions;

create policy "training_request_actions_select_own"
on public.training_request_actions
for select
to authenticated
using (
  exists (
    select 1
    from public.training_requests as tr
    where tr.id = training_request_actions.training_request_id
      and tr.requester_personnel_id = public.current_personnel_id()
  )
);

create policy "training_request_actions_select_administrator"
on public.training_request_actions
for select
to authenticated
using (
  public.is_personnel_administrator()
);

drop policy if exists "training_request_notifications_select_administrator" on public.training_request_notifications;

create policy "training_request_notifications_select_administrator"
on public.training_request_notifications
for select
to authenticated
using (
  public.is_personnel_administrator()
);

grant select on table public.training_request_actions to authenticated;
grant select on table public.training_request_notifications to authenticated;

revoke all on function public.format_personnel_full_name(text, text) from public;
revoke all on function public.get_current_personnel_actor() from public;
revoke all on function public.get_current_personnel_actor() from anon;
revoke all on function public.get_current_personnel_actor() from authenticated;
revoke all on function public.require_training_request_action_comments(text, text) from public;
revoke all on function public.require_training_request_action_comments(text, text) from anon;
revoke all on function public.require_training_request_action_comments(text, text) from authenticated;
revoke all on function public.insert_training_request_action(uuid, text, text, text, timestamptz) from public;
revoke all on function public.insert_training_request_action(uuid, text, text, text, timestamptz) from anon;
revoke all on function public.insert_training_request_action(uuid, text, text, text, timestamptz) from authenticated;
revoke all on function public.build_training_request_notification_copy(text, public.training_requests) from public;
revoke all on function public.build_training_request_notification_copy(text, public.training_requests) from anon;
revoke all on function public.build_training_request_notification_copy(text, public.training_requests) from authenticated;
revoke all on function public.enqueue_training_request_notifications(uuid, uuid, text) from public;
revoke all on function public.enqueue_training_request_notifications(uuid, uuid, text) from anon;
revoke all on function public.enqueue_training_request_notifications(uuid, uuid, text) from authenticated;

revoke all on function public.submit_training_request(uuid) from public;
revoke all on function public.resubmit_training_request(uuid) from public;
revoke all on function public.mto_approve_training_request(uuid, text) from public;
revoke all on function public.mto_return_training_request(uuid, text) from public;
revoke all on function public.mto_deny_training_request(uuid, text) from public;
revoke all on function public.deputy_approve_training_request(uuid, text) from public;
revoke all on function public.deputy_return_training_request(uuid, text) from public;
revoke all on function public.deputy_deny_training_request(uuid, text) from public;

revoke all on function public.claim_pending_training_request_notifications(integer) from public;
revoke all on function public.claim_pending_training_request_notifications(integer) from anon;
revoke all on function public.claim_pending_training_request_notifications(integer) from authenticated;

grant execute on function public.claim_pending_training_request_notifications(integer) to service_role;

grant select, update on table public.training_request_notifications to service_role;
grant select on table public.training_requests to service_role;

grant execute on function public.submit_training_request(uuid) to authenticated;
grant execute on function public.resubmit_training_request(uuid) to authenticated;
grant execute on function public.mto_approve_training_request(uuid, text) to authenticated;
grant execute on function public.mto_return_training_request(uuid, text) to authenticated;
grant execute on function public.mto_deny_training_request(uuid, text) to authenticated;
grant execute on function public.deputy_approve_training_request(uuid, text) to authenticated;
grant execute on function public.deputy_return_training_request(uuid, text) to authenticated;
grant execute on function public.deputy_deny_training_request(uuid, text) to authenticated;

comment on table public.training_request_actions is
  'Immutable workflow action history for training requests. Actor identity fields are trusted database snapshots.';

comment on column public.training_request_actions.signature_name is
  'Authenticated electronic signature name captured at approval time.';

comment on table public.training_request_notifications is
  'Email notification outbox for training request workflow events. Not exposed through the Supabase Data API.';

comment on function public.submit_training_request(uuid) is
  'Submits a draft request into pending MTO review, records submitted action history, and enqueues MTO notifications.';

comment on function public.resubmit_training_request(uuid) is
  'Resubmits a returned request into pending MTO review and restarts the approval workflow.';

comment on function public.mto_approve_training_request(uuid, text) is
  'Records an authenticated MTO electronic signature and advances the request to Deputy Chief review.';

comment on function public.deputy_approve_training_request(uuid, text) is
  'Records an authenticated Deputy Chief electronic signature and marks the request approved.';

comment on function public.claim_pending_training_request_notifications(integer) is
  'Claims pending, retryable failed, and stale processing notification rows for delivery. Uses FOR UPDATE SKIP LOCKED and increments attempts only for new claims, not stale processing recovery.';
