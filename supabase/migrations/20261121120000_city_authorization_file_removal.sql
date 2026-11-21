-- Let Office and administrative backups remove a wrongly uploaded City
-- Authorization. Removal hides the file from the request and downloads but
-- keeps the private object and a removed-by record for the audit trail.
-- When no file remains, the task returns to pending and Office's alert returns.
begin;

alter table public.training_request_city_authorization_files
  add column removed_at timestamptz,
  add column removed_by_personnel_id uuid references public.personnel(id),
  add column removed_by_name text,
  add constraint city_authorization_files_removal_complete check (
    (removed_at is null and removed_by_personnel_id is null and removed_by_name is null)
    or (removed_at is not null and removed_by_personnel_id is not null and length(trim(removed_by_name))>0)
  );

-- A task can now return to pending after uploads (version > 0).
alter table public.training_request_city_authorizations
  drop constraint training_request_city_authorizations_check,
  add constraint training_request_city_authorizations_state_check check (
    (status='pending' and completed_at is null and completed_by_personnel_id is null and completed_by_name is null)
    or (status='uploaded' and version>0 and completed_at is not null and completed_by_personnel_id is not null and length(trim(completed_by_name))>0)
  );

-- File rows stay immutable except for the one-time removal marking.
create or replace function public.guard_city_authorization_files() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' and old.removed_at is null and new.removed_at is not null
    and (to_jsonb(new)-array['removed_at','removed_by_personnel_id','removed_by_name'])
      =(to_jsonb(old)-array['removed_at','removed_by_personnel_id','removed_by_name']) then
    return new;
  end if;
  raise exception 'City Authorization file history is immutable';
end $$;
revoke all on function public.guard_city_authorization_files() from public,anon,authenticated;

-- Removed files are no longer visible to signed-in clients.
drop policy city_authorization_files_read on public.training_request_city_authorization_files;
create policy city_authorization_files_read on public.training_request_city_authorization_files for select to authenticated using (
  removed_at is null
  and exists(select 1 from public.training_request_city_authorizations c where c.request_id=training_request_city_authorization_files.request_id)
);

create function public.record_city_authorization_file_removal(
  p_actor_id uuid, p_request_id uuid, p_expected_version integer, p_file_id uuid
) returns public.training_request_city_authorizations
language plpgsql security definer set search_path=public as $$
declare actor public.personnel; req public.training_requests; item public.training_request_city_authorizations;
  target public.training_request_city_authorization_files; actor_name text;
begin
  select * into actor from public.personnel where id=p_actor_id and active;
  if actor.id is null or actor.role not in ('office','admin','mto','deputy_chief') then
    raise exception 'Office or administrative access is required';
  end if;
  actor_name=trim(concat_ws(' ',actor.first_name,actor.last_name));
  if actor_name='' then raise exception 'A name is required to remove a file'; end if;
  select * into req from public.training_requests where id=p_request_id for update;
  if req.id is null or req.status<>'approved' or req.deleted_at is not null then
    raise exception 'City Authorization is available only after Deputy Chief approval';
  end if;
  select * into item from public.training_request_city_authorizations where request_id=p_request_id for update;
  if item.request_id is null then raise exception 'City Authorization file not found'; end if;
  if p_expected_version is null or p_expected_version<>item.version then
    raise exception 'This authorization changed. Reload before removing a file';
  end if;
  select * into target from public.training_request_city_authorization_files
    where id=p_file_id and request_id=p_request_id and removed_at is null for update;
  if target.id is null then raise exception 'City Authorization file not found'; end if;

  update public.training_request_city_authorization_files
    set removed_at=now(),removed_by_personnel_id=actor.id,removed_by_name=actor_name
    where id=target.id;

  if exists(select 1 from public.training_request_city_authorization_files where request_id=p_request_id and removed_at is null) then
    update public.training_request_city_authorizations set version=item.version+1
      where request_id=p_request_id returning * into item;
  else
    update public.training_request_city_authorizations set status='pending',version=item.version+1,
      completed_at=null,completed_by_personnel_id=null,completed_by_name=null
      where request_id=p_request_id returning * into item;
  end if;
  return item;
end $$;
revoke all on function public.record_city_authorization_file_removal(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.record_city_authorization_file_removal(uuid,uuid,integer,uuid) to service_role;

notify pgrst,'reload schema';
commit;
