begin;

-- Empty preserves existing routing until an administrator explicitly chooses a DC.
insert into public.system_settings (key, value)
values ('primary_approval_deputy_chief', '') on conflict (key) do nothing;

create or replace function public.receives_deputy_approval_notifications(p_personnel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personnel p
    where p.id = p_personnel_id and p.active and p.role = 'deputy_chief'
      and (coalesce((select value from public.system_settings
        where key = 'primary_approval_deputy_chief'), '') in ('', p.id::text))
  );
$$;
revoke all on function public.receives_deputy_approval_notifications(uuid) from public, anon;
grant execute on function public.receives_deputy_approval_notifications(uuid) to authenticated, service_role;

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
    -- Serialize routing with recipient changes so newly queued alerts cannot
    -- miss both the old and the new recipient during a settings update.
    perform 1 from public.system_settings
      where key = 'primary_approval_deputy_chief' for share;
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
      and public.receives_deputy_approval_notifications(p.id)
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

-- This setting controls notification routing only. Both DCs retain the existing
-- review RPCs, signature permissions, queues, and administrative access.
create or replace function public.set_primary_approval_deputy_chief(p_personnel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid;
  previous_value text;
  target public.personnel;
begin
  actor_id := public.current_personnel_id();
  if actor_id is null or not public.is_personnel_administrator() then
    raise exception 'Administrative access required' using errcode = '42501';
  end if;

  -- Lock the selected person before settings, matching personnel-change triggers.
  select * into target from public.personnel where id = p_personnel_id for update;
  if target.id is null or not target.active or target.role <> 'deputy_chief' then
    raise exception 'Choose an active Deputy Chief.' using errcode = '22023';
  end if;
  select value into previous_value from public.system_settings
    where key = 'primary_approval_deputy_chief' for update;
  if not found then raise exception 'Approval notification setting is missing'; end if;
  if previous_value = p_personnel_id::text then return; end if;

  update public.system_settings set value = p_personnel_id::text,
    updated_by_personnel_id = actor_id where key = 'primary_approval_deputy_chief';
  insert into public.system_settings_audit
    (setting_key, old_value, new_value, changed_by_personnel_id)
  values ('primary_approval_deputy_chief', previous_value, p_personnel_id::text, actor_id);

  -- Transfer only unsent, still-current alerts, retaining their original age.
  -- Completed/historical notifications and immutable approval records stay intact.
  insert into public.training_request_notifications
    (training_request_id, source_action_id, event_type, recipient_email,
     recipient_personnel_id, subject, message_text, created_at)
  select distinct on (n.source_action_id) n.training_request_id, n.source_action_id,
    n.event_type, target.email, target.id, n.subject, n.message_text, n.created_at
  from public.training_request_notifications n
  join public.training_requests r on r.id = n.training_request_id
  where n.event_type = 'pending_deputy_chief' and n.status in ('pending', 'failed', 'processing')
    and n.attempts < 5
    and r.status = 'pending_deputy_chief' and r.current_action_role = 'deputy_chief'
    and n.source_action_id = (
      select a.id from public.training_request_actions a where a.training_request_id = r.id
        and a.action in ('submitted','resubmitted','mto_approved','mto_returned','mto_denied',
          'deputy_chief_approved','deputy_chief_returned','deputy_chief_denied','cancelled')
      order by a.created_at desc, a.id desc limit 1)
  order by n.source_action_id, n.created_at
  on conflict (source_action_id, event_type, recipient_email) do update
    set status = 'pending', last_error = null, processing_started_at = null, next_attempt_at = now()
    where training_request_notifications.status = 'skipped'
      and training_request_notifications.last_error = 'Deputy Chief approval recipient changed'
      and training_request_notifications.sent_at is null;

  update public.training_request_notifications set status = 'skipped',
    last_error = 'Deputy Chief approval recipient changed', processing_started_at = null
  where event_type = 'pending_deputy_chief' and recipient_personnel_id <> target.id
    and status in ('pending', 'failed', 'processing');
end;
$$;
revoke all on function public.set_primary_approval_deputy_chief(uuid) from public, anon;
grant execute on function public.set_primary_approval_deputy_chief(uuid) to authenticated;

-- Avoid leaving the selected route pointing at an inactive/deleted/non-DC user.
create or replace function public.protect_primary_approval_deputy_chief()
returns trigger language plpgsql security definer set search_path = public as $$
declare selected_id text;
begin
  select value into selected_id from public.system_settings
    where key = 'primary_approval_deputy_chief' for update;
  if selected_id = old.id::text and
    (tg_op = 'DELETE' or not new.active or new.role <> 'deputy_chief') then
    raise exception 'Choose another Deputy Chief for approval alerts in System Settings first.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_primary_approval_deputy_chief() from public, anon, authenticated;
create trigger personnel_protect_primary_approval_deputy_chief
before update of active, role or delete on public.personnel
for each row execute function public.protect_primary_approval_deputy_chief();

notify pgrst, 'reload schema';
commit;
