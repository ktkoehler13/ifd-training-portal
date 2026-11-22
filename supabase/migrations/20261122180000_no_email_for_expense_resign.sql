-- Approved-expense re-signatures no longer email the requester (D27 update).
-- The request stays Approved; the change, reason and signature remain in the
-- history and regenerated forms. Decision changes still send normal emails.
--
-- Replaces the 20261122120000 version of
-- complete_training_request_signature_action; only the notification step changes.

begin;

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

  if reservation_row.kind <> 'expense_resign' then
    notification_event_type := next_status;
    perform public.enqueue_training_request_notifications(request_row.id, action_row.id, notification_event_type);
  end if;

  if next_status = 'approved' then
    perform public.upsert_training_request_packet_pending(request_row.id);
    if action_role = 'mto' then
      perform public.ensure_city_authorization_task(request_row.id);
    end if;
  end if;

  return request_row;
end;
$$;

revoke all on function public.complete_training_request_signature_action(uuid, text, boolean, text, text, text, text, bigint) from public, anon, authenticated;

commit;
