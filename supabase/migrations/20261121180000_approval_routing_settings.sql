-- Approval routing in System Settings: primary MTO, primary Office and Fire Chief.
-- * Primary MTO: only that MTO receives MTO review emails; other MTOs keep full
--   review/signing access and portal queues as backups (same model as the DC).
-- * Primary Office: receives new Office email alerts and the Office action badge.
--   Other Office users can still process tasks quietly as backups.
-- * Fire Chief: recorded only. No alerts or workflow step use it yet.
-- Empty values preserve the previous behavior (everyone in that role).
begin;

insert into public.system_settings (key, value) values
  ('primary_approval_mto', ''), ('primary_office', ''), ('fire_chief', '')
on conflict (key) do nothing;

create or replace function public.receives_mto_approval_notifications(p_personnel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personnel p
    where p.id = p_personnel_id and p.active and p.role = 'mto'
      and (coalesce((select value from public.system_settings
        where key = 'primary_approval_mto'), '') in ('', p.id::text))
  );
$$;
revoke all on function public.receives_mto_approval_notifications(uuid) from public, anon;
grant execute on function public.receives_mto_approval_notifications(uuid) to authenticated, service_role;

create or replace function public.receives_office_notifications(p_personnel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personnel p
    where p.id = p_personnel_id and p.active and p.role = 'office'
      and (coalesce((select value from public.system_settings
        where key = 'primary_office'), '') in ('', p.id::text))
  );
$$;
revoke all on function public.receives_office_notifications(uuid) from public, anon;
grant execute on function public.receives_office_notifications(uuid) to authenticated, service_role;

-- Office alerts: City Authorization tasks come from the signed DC approval action;
-- compensation handoffs come from the MTO-approved compensation event.
alter table public.training_request_notifications
  alter column source_action_id drop not null,
  add column source_compensation_event_id uuid references public.training_compensation_events(id) on delete cascade,
  add constraint training_request_notifications_one_source check (num_nonnulls(source_action_id, source_compensation_event_id) = 1),
  drop constraint training_request_notifications_event_type_check,
  add constraint training_request_notifications_event_type_check check (event_type in (
    'pending_mto', 'pending_deputy_chief', 'returned_for_correction', 'denied', 'approved',
    'office_city_authorization', 'office_compensation'));
create unique index training_request_notifications_unique_compensation_recipient
  on public.training_request_notifications (source_compensation_event_id, event_type, recipient_email)
  where source_compensation_event_id is not null;

create or replace function public.enqueue_office_notifications(
  p_training_request_id uuid, p_source_action_id uuid, p_source_compensation_event_id uuid, p_event_type text
) returns void language plpgsql security definer set search_path = public as $$
declare req public.training_requests; subject_text text; body_text text;
begin
  if p_event_type not in ('office_city_authorization', 'office_compensation') then
    raise exception 'Unsupported Office notification event type: %', p_event_type;
  end if;
  select * into req from public.training_requests where id = p_training_request_id;
  if req.id is null then raise exception 'Training request not found'; end if;
  -- Serialize with routing changes, as for the primary Deputy Chief.
  perform 1 from public.system_settings where key = 'primary_office' for share;
  if p_event_type = 'office_city_authorization' then
    subject_text := 'City Authorization needed: ' || coalesce(req.request_number, req.training_title);
    body_text := 'A Deputy Chief approved this training request. Complete the City Authorization and upload it to the request.';
  else
    subject_text := 'Compensation packet ready for Office: ' || coalesce(req.request_number, req.training_title);
    body_text := 'The MTO signed this compensation packet. Select the compensation codes and mark it as submitted.';
  end if;
  insert into public.training_request_notifications
    (training_request_id, source_action_id, source_compensation_event_id, event_type,
     recipient_email, recipient_personnel_id, subject, message_text)
  select p_training_request_id, p_source_action_id, p_source_compensation_event_id, p_event_type,
    p.email, p.id, subject_text, body_text
  from public.personnel p
  where p.active and p.role = 'office' and public.receives_office_notifications(p.id)
  on conflict do nothing;
end $$;
revoke all on function public.enqueue_office_notifications(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Replaces the 20261119180000 version: also emails Office for each new task.
create or replace function public.queue_city_authorization_after_dc_approval()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.action='deputy_chief_approved' and exists(select 1 from public.training_requests r
      where r.id=new.training_request_id and r.status='approved' and r.deleted_at is null) then
    insert into public.training_request_city_authorizations(request_id) values(new.training_request_id) on conflict do nothing;
    if found then
      perform public.enqueue_office_notifications(new.training_request_id, new.id, null, 'office_city_authorization');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.queue_city_authorization_after_dc_approval() from public,anon,authenticated;

create function public.queue_office_compensation_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare request_id uuid;
begin
  select p.request_id into request_id from public.training_compensation_packets p where p.id = new.packet_id;
  if request_id is not null then
    perform public.enqueue_office_notifications(request_id, null, new.id, 'office_compensation');
  end if;
  return new;
end $$;
revoke all on function public.queue_office_compensation_alert() from public, anon, authenticated;
create trigger training_compensation_office_alert after insert on public.training_compensation_events
for each row when (new.action = 'mto_approved') execute function public.queue_office_compensation_alert();

-- Replaces the 20261114200000 version; only the MTO branch changes.
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
  select * into request_row from public.training_requests where id = p_training_request_id;
  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  select * into notification_copy
  from public.build_training_request_notification_copy(p_event_type, request_row);

  if p_event_type = 'pending_mto' then
    perform 1 from public.system_settings where key = 'primary_approval_mto' for share;
    insert into public.training_request_notifications (
      training_request_id, source_action_id, event_type, recipient_email,
      recipient_personnel_id, subject, message_text)
    select p_training_request_id, p_source_action_id, p_event_type, p.email, p.id,
      notification_copy.subject, notification_copy.message_text
    from public.personnel as p
    where p.active = true and p.role = 'mto'
      and public.receives_mto_approval_notifications(p.id)
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  elsif p_event_type = 'pending_deputy_chief' then
    perform 1 from public.system_settings where key = 'primary_approval_deputy_chief' for share;
    insert into public.training_request_notifications (
      training_request_id, source_action_id, event_type, recipient_email,
      recipient_personnel_id, subject, message_text)
    select p_training_request_id, p_source_action_id, p_event_type, p.email, p.id,
      notification_copy.subject, notification_copy.message_text
    from public.personnel as p
    where p.active = true and p.role = 'deputy_chief'
      and public.receives_deputy_approval_notifications(p.id)
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  else
    insert into public.training_request_notifications (
      training_request_id, source_action_id, event_type, recipient_email,
      recipient_personnel_id, subject, message_text)
    values (
      p_training_request_id, p_source_action_id, p_event_type,
      coalesce(
        request_row.request_contact_email,
        (select p.email from public.personnel as p
          where p.id = request_row.requester_personnel_id and p.active = true limit 1),
        request_row.requester_email),
      request_row.requester_personnel_id,
      notification_copy.subject, notification_copy.message_text)
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  end if;
end;
$$;

-- Administrators choose or clear the primary MTO, primary Office or Fire Chief.
-- Clearing restores everyone-in-role routing for new alerts.
create or replace function public.set_approval_routing(p_setting_key text, p_personnel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid;
  previous_value text;
  new_value text;
  target public.personnel;
  routed_events text[];
  change_reason text;
begin
  actor_id := public.current_personnel_id();
  if actor_id is null or not public.is_personnel_administrator() then
    raise exception 'Administrative access required' using errcode = '42501';
  end if;
  if p_setting_key not in ('primary_approval_mto', 'primary_office', 'fire_chief') then
    raise exception 'Unknown routing setting.' using errcode = '22023';
  end if;
  if p_personnel_id is not null then
    select * into target from public.personnel where id = p_personnel_id for update;
    if target.id is null or not target.active
      or (p_setting_key = 'primary_approval_mto' and target.role <> 'mto')
      or (p_setting_key = 'primary_office' and target.role <> 'office')
      or (p_setting_key = 'fire_chief' and target.title is distinct from 'fire_chief') then
      raise exception 'Choose an eligible active person.' using errcode = '22023';
    end if;
  end if;
  new_value := coalesce(p_personnel_id::text, '');
  select value into previous_value from public.system_settings where key = p_setting_key for update;
  if not found then raise exception 'Routing setting is missing'; end if;
  if previous_value = new_value then return; end if;

  update public.system_settings set value = new_value, updated_by_personnel_id = actor_id
    where key = p_setting_key;
  insert into public.system_settings_audit (setting_key, old_value, new_value, changed_by_personnel_id)
    values (p_setting_key, previous_value, new_value, actor_id);

  if p_setting_key = 'fire_chief' or p_personnel_id is null then
    -- Recording the Chief changes no alerts; clearing a primary affects new alerts only.
    return;
  end if;

  routed_events := case p_setting_key when 'primary_approval_mto' then array['pending_mto']
    else array['office_city_authorization', 'office_compensation'] end;
  change_reason := case p_setting_key when 'primary_approval_mto' then 'MTO approval recipient changed'
    else 'Office alert recipient changed' end;

  -- Revive this person's earlier suppressed copies, then copy any unsent alert they
  -- lack. The email worker rechecks that each task is still current before sending.
  update public.training_request_notifications set status = 'pending', last_error = null,
    processing_started_at = null, next_attempt_at = now()
  where event_type = any(routed_events) and recipient_personnel_id = target.id
    and status = 'skipped' and last_error in ('MTO approval recipient changed', 'Office alert recipient changed')
    and sent_at is null and attempts < 5
    and exists (select 1 from public.training_request_notifications o
      where o.event_type = training_request_notifications.event_type
        and o.source_action_id is not distinct from training_request_notifications.source_action_id
        and o.source_compensation_event_id is not distinct from training_request_notifications.source_compensation_event_id
        and o.status in ('pending', 'failed', 'processing'));
  insert into public.training_request_notifications
    (training_request_id, source_action_id, source_compensation_event_id, event_type,
     recipient_email, recipient_personnel_id, subject, message_text, created_at)
  select distinct on (n.event_type, n.source_action_id, n.source_compensation_event_id)
    n.training_request_id, n.source_action_id, n.source_compensation_event_id, n.event_type,
    target.email, target.id, n.subject, n.message_text, n.created_at
  from public.training_request_notifications n
  where n.event_type = any(routed_events) and n.status in ('pending', 'failed', 'processing')
    and n.attempts < 5 and n.recipient_personnel_id <> target.id
  order by n.event_type, n.source_action_id, n.source_compensation_event_id, n.created_at
  on conflict do nothing;

  update public.training_request_notifications set status = 'skipped',
    last_error = change_reason, processing_started_at = null
  where event_type = any(routed_events) and recipient_personnel_id <> target.id
    and status in ('pending', 'failed', 'processing');
end;
$$;
revoke all on function public.set_approval_routing(text, uuid) from public, anon;
grant execute on function public.set_approval_routing(text, uuid) to authenticated;

-- Keep routing pointed at an eligible person, as for the primary Deputy Chief.
create or replace function public.protect_approval_routing_personnel()
returns trigger language plpgsql security definer set search_path = public as $$
declare mto_id text; office_id text; chief_id text;
begin
  select value into mto_id from public.system_settings where key = 'primary_approval_mto' for update;
  select value into office_id from public.system_settings where key = 'primary_office' for update;
  select value into chief_id from public.system_settings where key = 'fire_chief' for update;
  if mto_id = old.id::text and (tg_op = 'DELETE' or not new.active or new.role <> 'mto') then
    raise exception 'Choose another primary MTO in System Settings first.';
  end if;
  if office_id = old.id::text and (tg_op = 'DELETE' or not new.active or new.role <> 'office') then
    raise exception 'Choose another primary Office person in System Settings first.';
  end if;
  if chief_id = old.id::text and (tg_op = 'DELETE' or not new.active or new.title is distinct from 'fire_chief') then
    raise exception 'Choose another Fire Chief in System Settings first.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_approval_routing_personnel() from public, anon, authenticated;
create trigger personnel_protect_approval_routing
before update of active, role, title or delete on public.personnel
for each row execute function public.protect_approval_routing_personnel();

notify pgrst, 'reload schema';
commit;
