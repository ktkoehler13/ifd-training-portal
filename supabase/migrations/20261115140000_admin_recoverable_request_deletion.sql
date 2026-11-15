begin;

alter table public.training_requests
  add column deleted_at timestamptz,
  add column deleted_by_personnel_id uuid references public.personnel(id),
  add column deleted_by_name text,
  add column deletion_reason text,
  add constraint training_requests_deletion_metadata_check check (
    (deleted_at is null and deleted_by_personnel_id is null and deleted_by_name is null and deletion_reason is null)
    or (deleted_at is not null and deleted_by_personnel_id is not null and deleted_by_name is not null and deletion_reason is not null and length(btrim(deleted_by_name)) > 0
      and length(btrim(deletion_reason)) between 1 and 1000)
  );
create index training_requests_deleted_at_idx on public.training_requests(deleted_at) where deleted_at is not null;

create function public.is_training_request_deletion_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.personnel where id=public.current_personnel_id() and active and role='admin');
$$;
revoke all on function public.is_training_request_deletion_admin() from public, anon;
grant execute on function public.is_training_request_deletion_admin() to authenticated;

-- Restrictive policies supplement existing ownership/reviewer policies. Only
-- Admin may read deleted records, including their action and packet metadata.
create policy training_requests_deleted_visibility on public.training_requests
  as restrictive for select to authenticated using (deleted_at is null or public.is_training_request_deletion_admin());
create policy training_requests_deleted_update on public.training_requests
  as restrictive for update to authenticated using (deleted_at is null) with check (deleted_at is null);
create policy training_requests_deleted_insert on public.training_requests
  as restrictive for insert to authenticated with check (deleted_at is null);
create policy training_request_actions_deleted_visibility on public.training_request_actions
  as restrictive for select to authenticated using (exists(select 1 from public.training_requests r where r.id=training_request_id));
create policy training_request_packets_deleted_visibility on public.training_request_packets
  as restrictive for select to authenticated using (exists(select 1 from public.training_requests r where r.id=request_id));
create policy training_request_notifications_deleted_visibility on public.training_request_notifications
  as restrictive for select to authenticated using (exists(select 1 from public.training_requests r where r.id=training_request_id));

alter table public.training_request_actions drop constraint training_request_actions_action_check;
alter table public.training_request_actions add constraint training_request_actions_action_check check (action in (
  'submitted','mto_approved','mto_returned','mto_denied','mto_expenses_updated',
  'deputy_chief_approved','deputy_chief_returned','deputy_chief_denied','resubmitted','cancelled',
  'request_deleted','request_restored'
));

-- Security-invoker deliberately checks the SQL execution role: authenticated
-- callers cannot forge authorization with a custom session setting. Only the
-- narrow security-definer RPC below may modify deletion metadata.
create function public.guard_training_request_deletion()
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
      raise exception 'Only an active Admin may delete or restore requests through the dedicated action';
    end if;
    if (to_jsonb(new)-array['deleted_at','deleted_by_personnel_id','deleted_by_name','deletion_reason','updated_at'])
      is distinct from (to_jsonb(old)-array['deleted_at','deleted_by_personnel_id','deleted_by_name','deletion_reason','updated_at']) then
      raise exception 'Deleting or restoring a request cannot change its recorded details';
    end if;
  elsif old.deleted_at is not null then
    raise exception 'This request is deleted. An Admin must restore it before it can be changed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_training_request_deletion() from public, anon, authenticated;
create trigger training_requests_00_deletion_guard before insert or update or delete on public.training_requests
  for each row execute function public.guard_training_request_deletion();

-- Also block security-definer workflow RPCs that create reservations or packet
-- work before updating the request. Taking its row lock serializes with delete.
create function public.guard_deleted_training_request_work()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid; removed_at timestamptz;
begin
  target_id := case when tg_table_name='training_request_packets' then (to_jsonb(new)->>'request_id')::uuid
    else (to_jsonb(new)->>'training_request_id')::uuid end;
  select deleted_at into removed_at from public.training_requests where id=target_id for update;
  if removed_at is not null and not (tg_table_name='training_request_actions' and coalesce(to_jsonb(new)->>'action','')='request_deleted') then
    raise exception 'This request is deleted. An Admin must restore it before it can be changed';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_deleted_training_request_work() from public, anon, authenticated;
create trigger training_request_actions_deleted_guard before insert on public.training_request_actions
  for each row execute function public.guard_deleted_training_request_work();
create trigger training_request_reservations_deleted_guard before insert on public.training_request_signature_action_reservations
  for each row execute function public.guard_deleted_training_request_work();
create trigger training_request_packets_deleted_guard before insert or update on public.training_request_packets
  for each row execute function public.guard_deleted_training_request_work();

create function public.admin_set_training_request_deleted(p_request_id uuid, p_expected_updated_at timestamptz, p_deleted boolean, p_reason text)
returns public.training_requests language plpgsql security definer set search_path = public as $$
declare actor record; original public.training_requests; revised public.training_requests;
begin
  select * into actor from public.get_current_personnel_actor();
  if actor.actor_role is distinct from 'admin' then raise exception 'Only active Admin personnel may delete or restore requests'; end if;
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
revoke all on function public.admin_set_training_request_deleted(uuid,timestamptz,boolean,text) from public, anon;
grant execute on function public.admin_set_training_request_deleted(uuid,timestamptz,boolean,text) to authenticated;

create or replace function public.claim_pending_training_request_notifications(batch_size integer default 25)
returns setof public.training_request_notifications language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select n.id from public.training_request_notifications n
    where exists(select 1 from public.training_requests r where r.id=n.training_request_id and r.deleted_at is null)
      and ((n.status in ('pending','failed') and n.attempts<5 and n.next_attempt_at<=now())
        or (n.status='processing' and n.processing_started_at<=now()-interval '15 minutes' and n.attempts<5))
    order by n.next_attempt_at,n.created_at limit greatest(batch_size,1) for update of n skip locked
  ) update public.training_request_notifications n set status='processing',processing_started_at=now(),attempts=n.attempts+1
    from candidates c where n.id=c.id returning n.*;
end;
$$;

comment on column public.training_requests.deleted_at is 'Recoverable Admin deletion. Original status, signatures, request number and packet remain unchanged. Only Admin can view deleted records.';
notify pgrst, 'reload schema';
commit;
