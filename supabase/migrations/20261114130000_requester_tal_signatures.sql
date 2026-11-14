begin;

-- All active personnel can maintain only their OWN saved signature. Approval
-- permissions and private snapshot storage policies are unchanged.
create or replace function public.can_manage_own_personnel_signature()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_personnel_role() in ('firefighter', 'mto', 'deputy_chief', 'admin');
$$;

create or replace function public.validate_personnel_signature_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  owner_role text;
begin
  owner_id := public.current_personnel_id();

  if owner_id is null then
    raise exception 'Active authenticated personnel record required';
  end if;

  if new.personnel_id <> owner_id then
    raise exception 'Personnel signature records may only be owned by the authenticated user';
  end if;

  select p.role
  into owner_role
  from public.personnel as p
  where p.id = owner_id
    and p.active = true;

  if owner_role not in ('firefighter', 'mto', 'deputy_chief', 'admin') then
    raise exception 'Only active personnel may store their own signatures';
  end if;

  if new.storage_bucket <> 'personnel-signatures' then
    raise exception 'Invalid personnel signature storage bucket';
  end if;

  if new.storage_path is null or btrim(new.storage_path) = '' then
    raise exception 'storage_path cannot be blank';
  end if;

  if new.storage_path <> public.expected_personnel_signature_storage_path(owner_id) then
    raise exception 'storage_path must match the owner signature object path';
  end if;

  if new.mime_type <> 'image/png' then
    raise exception 'Personnel signatures must be PNG images';
  end if;

  if new.file_size_bytes is null or new.file_size_bytes <= 0 then
    raise exception 'Personnel signature file size must be greater than zero';
  end if;

  if new.certification_confirmed is distinct from true then
    raise exception 'Signature certification is required';
  end if;

  new.certified_at := now();

  return new;
end;
$$;

alter table public.training_request_signature_action_reservations
  drop constraint training_request_signature_action_reservations_expected_action_check,
  drop constraint training_request_signature_action_reservations_actor_role_check,
  add column requester_expected_updated_at timestamptz,
  add constraint training_request_signature_action_reservations_expected_action_check
    check (expected_action in ('submitted','resubmitted','mto_approved','mto_denied','deputy_chief_approved','deputy_chief_denied')),
  add constraint training_request_signature_action_reservations_actor_role_check
    check (actor_role in ('firefighter','mto','deputy_chief','admin'));

create function public.reserve_requester_submission_signature(p_request_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor record; request_row public.training_requests; reservation_id uuid;
begin
  select * into actor from public.get_current_personnel_actor();
  select * into request_row from public.training_requests where id=p_request_id for update;
  if request_row.id is null or request_row.requester_personnel_id <> actor.personnel_id then
    raise exception 'Only the requester may sign this submission';
  end if;
  if request_row.is_ofpc_course is not true or request_row.status not in ('draft','returned_for_correction') then
    raise exception 'An editable OFPC request is required';
  end if;
  if p_expected_updated_at is null or request_row.updated_at <> p_expected_updated_at then
    raise exception 'The request changed. Refresh and review it before signing.';
  end if;
  perform public.require_personnel_signature_for_workflow_action(actor.personnel_id);
  insert into public.training_request_signature_action_reservations
    (training_request_id,actor_personnel_id,actor_name,actor_badge_number,actor_role,actor_auth_user_id,expected_action,requester_expected_updated_at)
  values (p_request_id,actor.personnel_id,actor.actor_name,actor.badge_number,actor.actor_role,auth.uid(),
    case when request_row.status='draft' then 'submitted' else 'resubmitted' end,request_row.updated_at)
  returning id into reservation_id;
  return reservation_id;
end;
$$;

-- Browser RPCs cannot bypass requester signing for new OFPC submissions.
create function public.require_state_course_submission_signature()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_ofpc_course is true and new.status='pending_mto'
    and old.status in ('draft','returned_for_correction')
    and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Confirm your saved signature and submit this OFPC request through the portal.';
  end if;
  return new;
end;
$$;
create trigger training_requests_require_requester_signature
before update on public.training_requests for each row
execute function public.require_state_course_submission_signature();

-- Only trusted server code can complete after verifying the uploaded PNG.
create function public.complete_requester_submission_signature(
  p_reservation_id uuid, p_electronic_signature_confirmed boolean,
  p_signature_storage_bucket text, p_signature_storage_path text,
  p_signature_sha256 text, p_signature_mime_type text, p_signature_file_size_bytes bigint
)
returns public.training_requests language plpgsql security definer set search_path = public as $$
declare r public.training_request_signature_action_reservations;
  tr public.training_requests; action_row public.training_request_actions;
begin
  if p_electronic_signature_confirmed is distinct from true then
    raise exception 'Requester signature confirmation is required';
  end if;
  select * into r from public.training_request_signature_action_reservations where id=p_reservation_id for update;
  if r.id is null or r.expected_action not in ('submitted','resubmitted') then
    raise exception 'Requester signature reservation not found';
  end if;
  select * into tr from public.training_requests where id=r.training_request_id for update;
  if r.consumed_at is not null then
    if exists(select 1 from public.training_request_actions where id=r.id and signature_storage_path=p_signature_storage_path) then
      return tr;
    end if;
    raise exception 'Signature reservation has already been consumed';
  end if;
  if r.expires_at <= now() then raise exception 'Signature reservation has expired'; end if;
  if tr.requester_personnel_id <> r.actor_personnel_id or not exists
    (select 1 from public.personnel where id=r.actor_personnel_id and active) then
    raise exception 'Active requester is required';
  end if;
  if tr.is_ofpc_course is not true or tr.status <> (case when r.expected_action='submitted' then 'draft' else 'returned_for_correction' end)
    or tr.updated_at is distinct from r.requester_expected_updated_at then
    raise exception 'The request changed. Refresh and review it before signing.';
  end if;
  if nullif(btrim(tr.training_title),'') is null then raise exception 'Training title is required'; end if;
  perform public.validate_signature_snapshot_metadata(tr.id,r.id,p_signature_storage_bucket,p_signature_storage_path,
    p_signature_sha256,p_signature_mime_type,p_signature_file_size_bytes);
  if r.expected_action='submitted' then
    if tr.request_number is not null then raise exception 'Draft requests must not have a request number'; end if;
    tr.request_number := public.generate_training_request_number_for_request(tr,now());
  end if;
  update public.training_requests set request_number=tr.request_number,status='pending_mto',current_action_role='mto',
    submitted_at=case when r.expected_action='submitted' then now() else submitted_at end
    where id=tr.id returning * into tr;
  action_row := public.insert_training_request_signature_action(r.id,tr.id,r.expected_action,r.actor_personnel_id,
    r.actor_name,r.actor_badge_number,r.actor_role,null,r.actor_name,now(),true,p_signature_storage_bucket,
    p_signature_storage_path,p_signature_sha256,p_signature_mime_type,p_signature_file_size_bytes);
  update public.training_request_signature_action_reservations set consumed_at=now() where id=r.id;
  perform public.enqueue_training_request_notifications(tr.id,action_row.id,'pending_mto');
  return tr;
end;
$$;

revoke all on function public.reserve_requester_submission_signature(uuid,timestamptz) from public,anon;
grant execute on function public.reserve_requester_submission_signature(uuid,timestamptz) to authenticated;
revoke all on function public.require_state_course_submission_signature() from public,anon,authenticated;
revoke all on function public.complete_requester_submission_signature(uuid,boolean,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.complete_requester_submission_signature(uuid,boolean,text,text,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
