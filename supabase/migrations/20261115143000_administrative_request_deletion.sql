begin;

-- Administrative privileges include Admin, MTO and Deputy Chief. Preserve the
-- existing RPC/helper names, grants and row policies for deployed clients.
-- The historical notification skip marker is retained so old deleted requests
-- resume eligible alerts correctly when restored.

create or replace function public.is_training_request_deletion_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.personnel where id=public.current_personnel_id() and active and role in ('admin','mto','deputy_chief'));
$$;

create or replace function public.guard_training_request_deletion()
returns trigger language plpgsql set search_path = public as $$
declare metadata_changed boolean;
begin
  if tg_op='DELETE' then
    if old.deleted_at is not null then raise exception 'Restore this request before attempting any other action'; end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.deleted_at is not null or new.deleted_by_personnel_id is not null or new.deleted_by_name is not null or new.deletion_reason is not null then
      raise exception 'New requests cannot be created as deleted';
    end if;
    return new;
  end if;
  metadata_changed := row(new.deleted_at,new.deleted_by_personnel_id,new.deleted_by_name,new.deletion_reason)
    is distinct from row(old.deleted_at,old.deleted_by_personnel_id,old.deleted_by_name,old.deletion_reason);
  if metadata_changed then
    if current_user in ('anon','authenticated','service_role') or not public.is_training_request_deletion_admin() then
      raise exception 'Only active administrative personnel may delete or restore requests through the dedicated action';
    end if;
    if (to_jsonb(new)-array['deleted_at','deleted_by_personnel_id','deleted_by_name','deletion_reason','updated_at'])
      is distinct from (to_jsonb(old)-array['deleted_at','deleted_by_personnel_id','deleted_by_name','deletion_reason','updated_at']) then
      raise exception 'Deleting or restoring a request cannot change its recorded details';
    end if;
  elsif old.deleted_at is not null then
    raise exception 'This request is deleted. An administrator must restore it before it can be changed';
  end if;
  return new;
end;
$$;

create or replace function public.guard_deleted_training_request_work()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid; removed_at timestamptz;
begin
  target_id := case when tg_table_name='training_request_packets' then (to_jsonb(new)->>'request_id')::uuid
    else (to_jsonb(new)->>'training_request_id')::uuid end;
  select deleted_at into removed_at from public.training_requests where id=target_id for update;
  if removed_at is not null and not (tg_table_name='training_request_actions' and coalesce(to_jsonb(new)->>'action','')='request_deleted') then
    raise exception 'This request is deleted. An administrator must restore it before it can be changed';
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_training_request_deleted(p_request_id uuid, p_expected_updated_at timestamptz, p_deleted boolean, p_reason text)
returns public.training_requests language plpgsql security definer set search_path = public as $$
declare actor record; original public.training_requests; revised public.training_requests;
begin
  select * into actor from public.get_current_personnel_actor();
  if not public.is_training_request_deletion_admin() then raise exception 'Only active administrative personnel may delete or restore requests'; end if;
  if p_deleted is null or p_reason is null or p_reason !~ '[^[:space:]]' or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Enter a reason (up to 1000 characters)';
  end if;
  select * into original from public.training_requests where id=p_request_id for update;
  if original.id is null then raise exception 'Training request not found'; end if;
  if p_expected_updated_at is null or original.updated_at<>p_expected_updated_at then
    raise exception 'This request has changed. Reload it before deleting or restoring';
  end if;
  if p_deleted=(original.deleted_at is not null) then raise exception 'This request has already been deleted or restored. Reload the list'; end if;
  if exists(select 1 from public.training_request_signature_action_reservations where training_request_id=p_request_id and consumed_at is null and expires_at>now()) then
    raise exception 'A signature action is in progress. Try again after it completes';
  end if;
  if exists(select 1 from public.training_request_packets where request_id=p_request_id and status in ('pending','processing') and updated_at>now()-interval '15 minutes') then
    raise exception 'Approved forms are being prepared. Try again after they finish';
  end if;
  -- Lock delivery rows before checking them so a concurrently claimed alert
  -- cannot slip into processing after the check. Already-sent mail is retained.
  perform id from public.training_request_notifications where training_request_id=p_request_id for update;
  if exists(select 1 from public.training_request_notifications where training_request_id=p_request_id and status='processing'
    and processing_started_at>now()-interval '15 minutes') then
    raise exception 'An email delivery is in progress. Try again shortly';
  end if;
  update public.training_requests set
    deleted_at=case when p_deleted then clock_timestamp() end,
    deleted_by_personnel_id=case when p_deleted then actor.personnel_id end,
    deleted_by_name=case when p_deleted then actor.actor_name end,
    deletion_reason=case when p_deleted then btrim(p_reason) end
    where id=p_request_id returning * into revised;
  perform public.insert_training_request_action(p_request_id,case when p_deleted then 'request_deleted' else 'request_restored' end,btrim(p_reason));
  if p_deleted then
    update public.training_request_notifications set status='skipped',last_error='Request deleted by Admin',processing_started_at=null
      where training_request_id=p_request_id and status in ('pending','failed','processing');
  else
    -- Resume only unsent action-required alerts; never resend final-decision mail.
    update public.training_request_notifications set status='pending',last_error=null,next_attempt_at=now(),processing_started_at=null
      where training_request_id=p_request_id and status='skipped' and last_error='Request deleted by Admin'
        and event_type in ('pending_mto','pending_deputy_chief','returned_for_correction') and attempts<5;
  end if;
  return revised;
end;
$$;

comment on function public.is_training_request_deletion_admin() is
  'True only for active authenticated Admin, MTO, or Deputy Chief personnel.';
comment on column public.training_requests.deleted_at is
  'Recoverable administrative deletion. Original status, signatures, request number and packet remain unchanged. Active Admin, MTO and Deputy Chief personnel can view and restore deleted records.';
notify pgrst, 'reload schema';
commit;
