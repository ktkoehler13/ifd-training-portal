begin;

-- Office needs read-only approved request details and forms for City processing.
-- General administrative and training-approval permissions remain unchanged.
create policy training_requests_select_office_approved on public.training_requests
for select to authenticated using (public.current_personnel_role()='office' and status='approved' and deleted_at is null);
create policy training_request_actions_select_office_approved on public.training_request_actions
for select to authenticated using (public.current_personnel_role()='office' and exists (
  select 1 from public.training_requests r where r.id=training_request_id and r.status='approved' and r.deleted_at is null));
create policy training_request_packets_select_office_approved on public.training_request_packets
for select to authenticated using (public.current_personnel_role()='office' and exists (
  select 1 from public.training_requests r where r.id=request_id and r.status='approved' and r.deleted_at is null));

create table public.training_request_city_authorizations (
  request_id uuid primary key references public.training_requests(id),
  status text not null default 'pending' check(status in ('pending','uploaded')),
  version integer not null default 0 check(version>=0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_personnel_id uuid references public.personnel(id),
  completed_by_name text,
  check ((status='pending' and version=0 and completed_at is null and completed_by_personnel_id is null and completed_by_name is null)
    or (status='uploaded' and version>0 and completed_at is not null and completed_by_personnel_id is not null and length(trim(completed_by_name))>0))
);
create table public.training_request_city_authorization_files (
  id uuid primary key,
  request_id uuid not null references public.training_request_city_authorizations(request_id),
  version integer not null check(version>0),
  file_name text not null check(length(file_name) between 1 and 120),
  storage_path text not null unique,
  content_type text not null check(content_type in ('application/pdf','image/png','image/jpeg')),
  file_size_bytes integer not null check(file_size_bytes between 1 and 4194304),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by_personnel_id uuid not null references public.personnel(id),
  uploaded_by_name text not null check(length(trim(uploaded_by_name))>0),
  uploaded_at timestamptz not null default now(),
  unique(request_id,version)
);
create index city_authorization_queue on public.training_request_city_authorizations(status,created_at);
alter table public.training_request_city_authorizations enable row level security;
alter table public.training_request_city_authorization_files enable row level security;
revoke all on public.training_request_city_authorizations,public.training_request_city_authorization_files from public,anon,authenticated;
grant select on public.training_request_city_authorizations,public.training_request_city_authorization_files to authenticated;
grant all on public.training_request_city_authorizations,public.training_request_city_authorization_files to service_role;
create policy city_authorization_read on public.training_request_city_authorizations for select to authenticated using (
  exists(select 1 from public.training_requests r where r.id=request_id and r.status='approved' and r.deleted_at is null)
);
create policy city_authorization_files_read on public.training_request_city_authorization_files for select to authenticated using (
  exists(select 1 from public.training_request_city_authorizations c where c.request_id=training_request_city_authorization_files.request_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('city-authorizations','city-authorizations',false,4194304,array['application/pdf','image/png','image/jpeg'])
on conflict(id) do nothing;
-- No client storage policies. Server routes authorize each private download.

create function public.queue_city_authorization_after_dc_approval()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.action='deputy_chief_approved' and exists(select 1 from public.training_requests r
      where r.id=new.training_request_id and r.status='approved' and r.deleted_at is null) then
    insert into public.training_request_city_authorizations(request_id) values(new.training_request_id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_city_authorization_after_dc_approval() from public,anon,authenticated;
create trigger training_request_dc_city_authorization after insert on public.training_request_actions
for each row when(new.action='deputy_chief_approved') execute function public.queue_city_authorization_after_dc_approval();
-- Deliberately no historical backfill: new DC approvals start the queue.

create function public.record_city_authorization_upload(
  p_actor_id uuid, p_request_id uuid, p_expected_version integer, p_file_id uuid,
  p_file_name text, p_storage_path text, p_content_type text, p_file_size_bytes integer, p_sha256 text
) returns public.training_request_city_authorizations
language plpgsql security definer set search_path=public as $$
declare actor public.personnel; req public.training_requests; item public.training_request_city_authorizations; actor_name text;
begin
  select * into actor from public.personnel where id=p_actor_id and active;
  if actor.id is null or actor.role not in ('office','admin','mto','deputy_chief') then
    raise exception 'Office or administrative access is required';
  end if;
  actor_name=trim(concat_ws(' ',actor.first_name,actor.last_name));
  if actor_name='' then raise exception 'An uploader name is required'; end if;
  select * into req from public.training_requests where id=p_request_id for update;
  if req.id is null or req.status<>'approved' or req.deleted_at is not null then
    raise exception 'City Authorization is available only after Deputy Chief approval';
  end if;
  if p_file_id is null or p_content_type is null or p_content_type not in ('application/pdf','image/png','image/jpeg')
    or p_storage_path is distinct from (p_request_id::text || '/' || p_file_id::text || case p_content_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end) then
    raise exception 'Invalid authorization file path or type';
  end if;
  insert into public.training_request_city_authorizations(request_id) values(p_request_id) on conflict do nothing;
  select * into item from public.training_request_city_authorizations where request_id=p_request_id for update;
  if p_expected_version is null or p_expected_version<>item.version then raise exception 'This authorization changed. Reload before uploading again'; end if;
  insert into public.training_request_city_authorization_files(id,request_id,version,file_name,storage_path,content_type,file_size_bytes,sha256,uploaded_by_personnel_id,uploaded_by_name)
  values(p_file_id,p_request_id,item.version+1,p_file_name,p_storage_path,p_content_type,p_file_size_bytes,p_sha256,actor.id,actor_name);
  update public.training_request_city_authorizations set status='uploaded',version=item.version+1,
    completed_at=now(),completed_by_personnel_id=actor.id,completed_by_name=actor_name
    where request_id=p_request_id returning * into item;
  return item;
end $$;
revoke all on function public.record_city_authorization_upload(uuid,uuid,integer,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.record_city_authorization_upload(uuid,uuid,integer,uuid,text,text,text,integer,text) to service_role;

create function public.guard_city_authorization_files() returns trigger language plpgsql as $$
begin raise exception 'City Authorization file history is immutable'; end $$;
revoke all on function public.guard_city_authorization_files() from public,anon,authenticated;
create trigger city_authorization_files_immutable before update or delete on public.training_request_city_authorization_files
for each row execute function public.guard_city_authorization_files();

notify pgrst,'reload schema';
commit;
