begin;

-- Office is an application role, not a rank or a general administrative role.
-- No existing account assignments or signed records change.
alter table public.personnel drop constraint personnel_role_check;
alter table public.personnel add constraint personnel_role_check
  check (role in ('firefighter','mto','deputy_chief','admin','office'));

-- Office personnel retain ordinary requester capabilities for their own training.
alter table public.training_request_actions drop constraint training_request_actions_actor_role_check;
alter table public.training_request_actions add constraint training_request_actions_actor_role_check
  check (actor_role in ('firefighter','mto','deputy_chief','admin','office'));
alter table public.training_request_signature_action_reservations
  drop constraint training_request_signature_action_reservations_actor_role_check;
alter table public.training_request_signature_action_reservations
  add constraint training_request_signature_action_reservations_actor_role_check
  check (actor_role in ('firefighter','mto','deputy_chief','admin','office'));

create or replace function public.can_manage_own_personnel_signature()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_personnel_role() in ('firefighter', 'mto', 'deputy_chief', 'admin', 'office');
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

  if owner_role not in ('firefighter', 'mto', 'deputy_chief', 'admin', 'office') then
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

create or replace function public.insert_training_request_signature_action(
  p_action_id uuid,
  p_training_request_id uuid,
  p_action text,
  p_actor_personnel_id uuid,
  p_actor_name text,
  p_actor_badge_number text,
  p_actor_role text,
  p_comments text default null,
  p_signature_name text default null,
  p_signed_at timestamptz default null,
  p_electronic_signature_confirmed boolean default false,
  p_signature_storage_bucket text default null,
  p_signature_storage_path text default null,
  p_signature_sha256 text default null,
  p_signature_mime_type text default null,
  p_signature_file_size_bytes bigint default null
)
returns public.training_request_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_action public.training_request_actions;
begin
  if p_actor_name is null or btrim(p_actor_name) = '' then
    raise exception 'Reviewer name is required to record this action';
  end if;

  if p_actor_badge_number is null or btrim(p_actor_badge_number) = '' then
    raise exception 'Reviewer badge number is required to record this action';
  end if;

  if p_actor_role not in ('mto', 'deputy_chief', 'admin', 'firefighter', 'office') then
    raise exception 'Invalid reviewer role for training request action';
  end if;

  insert into public.training_request_actions (
    id,
    training_request_id,
    actor_personnel_id,
    actor_name,
    actor_badge_number,
    actor_role,
    action,
    comments,
    signature_name,
    signed_at,
    electronic_signature_confirmed,
    signature_storage_bucket,
    signature_storage_path,
    signature_sha256,
    signature_mime_type,
    signature_file_size_bytes
  )
  values (
    p_action_id,
    p_training_request_id,
    p_actor_personnel_id,
    p_actor_name,
    p_actor_badge_number,
    p_actor_role,
    p_action,
    nullif(btrim(coalesce(p_comments, '')), ''),
    p_signature_name,
    p_signed_at,
    coalesce(p_electronic_signature_confirmed, false),
    p_signature_storage_bucket,
    p_signature_storage_path,
    p_signature_sha256,
    p_signature_mime_type,
    p_signature_file_size_bytes
  )
  returning * into inserted_action;

  return inserted_action;
end;
$$;


-- Security definer checks the actual packet and request without requiring Office
-- to read the underlying training request (which includes unrelated personal data).
create function public.can_read_training_compensation(p_request_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.training_compensation_packets c
    join public.training_requests r on r.id=c.request_id
    join public.personnel p on p.id=public.current_personnel_id() and p.active
    where c.request_id=p_request_id and r.deleted_at is null
      and (p.id=c.requester_id or p.role in ('mto','admin','deputy_chief')
        or (p.role='office' and c.status in ('pending_office','completed') and c.mto_signature is not null))
  );
$$;
revoke all on function public.can_read_training_compensation(uuid) from public,anon;
grant execute on function public.can_read_training_compensation(uuid) to authenticated;
drop policy compensation_read on public.training_compensation_packets;
create policy compensation_read on public.training_compensation_packets for select to authenticated
  using (public.can_read_training_compensation(request_id));

create or replace function public.save_training_compensation(
 p_actor_id uuid, p_request_id uuid, p_expected_version integer,
 p_action text, p_data jsonb, p_identity jsonb, p_receipts jsonb,
 p_signature jsonb default null, p_pdf_path text default null, p_pdf_sha256 text default null,
 p_note text default '', p_office_codes text[] default '{}'
) returns public.training_compensation_packets
language plpgsql security definer set search_path=public as $$
declare actor public.personnel; req public.training_requests; packet public.training_compensation_packets;
 actor_name text; event_action text; current_rate_text text; current_mileage_rate numeric;
begin
 select * into actor from public.personnel where id=p_actor_id and active;
 if actor.id is null then raise exception 'Active account required'; end if;
 select * into req from public.training_requests where id=p_request_id for update;
 if req.id is null or req.deleted_at is not null or req.status<>'approved' or req.end_date is null or req.end_date>(now() at time zone 'America/New_York')::date then
   raise exception 'Compensation is available after approved training is complete';
 end if;
 select * into packet from public.training_compensation_packets where request_id=p_request_id for update;
 if p_action in ('save','submit') then
   -- Hold a shared row lock until the PDF snapshot is committed. A concurrent
   -- administrator rate update cannot change the amount after it is checked.
   select value into current_rate_text from public.system_settings where key='gsa_mileage_rate' for share;
   if current_rate_text is null or trim(current_rate_text) !~ '^[0-9]+([.][0-9]{1,4})?$' then
     raise exception 'Configure a valid mileage rate in System Settings';
   end if;
   current_mileage_rate=trim(current_rate_text)::numeric;
   if current_mileage_rate<=0 then raise exception 'Configure a positive mileage rate in System Settings'; end if;
   if p_action='submit' then
     if jsonb_typeof(p_identity->'mileageRate') is distinct from 'number' then
       raise exception 'Mileage rate changed. Review the updated totals and sign again';
     end if;
     if (p_identity->>'mileageRate')::numeric is distinct from current_mileage_rate then
       raise exception 'Mileage rate changed. Review the updated totals and sign again';
     end if;
   end if;
   p_identity=jsonb_set(p_identity,'{mileageRate}',to_jsonb(current_mileage_rate),true);
 end if;
 if packet.id is null then
   if p_expected_version is null or p_expected_version<>0 or p_action<>'save' or actor.id<>req.requester_personnel_id then raise exception 'Start and save your own compensation packet first'; end if;
   insert into public.training_compensation_packets(request_id,requester_id,data,identity,receipts)
   values(req.id,actor.id,p_data,p_identity,'[]') returning * into packet;
   return packet;
 end if;
 if p_expected_version is null or packet.version<>p_expected_version then raise exception 'This packet changed. Reload it before continuing'; end if;
 actor_name=trim(concat_ws(' ',actor.first_name,actor.last_name));
 if p_action in ('save','submit','receipts') then
   if actor.id<>packet.requester_id or packet.status not in ('draft','returned') then raise exception 'Only the requester can edit a draft or returned packet'; end if;
   if p_action in ('save','submit') then packet.data=p_data; end if;
   -- Requester/course identity stays fixed. Drafts and new submissions take
   -- the current configured rate; signed events and PDFs retain their snapshots.
   if p_action in ('save','submit') then packet.identity=jsonb_set(packet.identity,'{mileageRate}',to_jsonb(current_mileage_rate),true); end if;
   if p_action='receipts' then packet.receipts=p_receipts; end if;
   if p_action='submit' then
     if p_signature is null or not coalesce(p_signature->>'sha256' ~ '^[a-f0-9]{64}$',false) or p_pdf_path is null or p_pdf_sha256 is null then raise exception 'Signed packet required'; end if;
     packet.requester_signature=p_signature; packet.mto_signature=null; packet.office_codes='{}';
     packet.office_name=null; packet.office_completed_at=null;
     packet.status='pending_mto'; packet.review_note=''; event_action='submitted';
   end if;
 elsif p_action in ('approve','return') then
   if actor.role<>'mto' or packet.status<>'pending_mto' then raise exception 'This packet requires MTO review'; end if;
   if p_action='return' then
     if length(trim(p_note))<3 then raise exception 'Explain the corrections needed'; end if;
     packet.status='returned'; packet.review_note=trim(p_note); event_action='returned';
   else
     if p_signature is null or not coalesce(p_signature->>'sha256' ~ '^[a-f0-9]{64}$',false) or p_pdf_path is null or p_pdf_sha256 is null then raise exception 'MTO signature and signed packet required'; end if;
     packet.mto_signature=p_signature; packet.status='pending_office'; event_action='mto_approved';
   end if;
 elsif p_action='complete' then
   if actor.role not in ('office','mto','admin','deputy_chief') or packet.status<>'pending_office' then raise exception 'Office completion requires the Office role or administrative privileges after MTO approval'; end if;
   if cardinality(p_office_codes)=0 or not (p_office_codes <@ array['TTM','OC','TNM','OCTR','EM','OCEC','TM','OCET']) or p_pdf_path is null or p_pdf_sha256 is null then raise exception 'Select office compensation codes and prepare the completed packet'; end if;
   packet.office_codes=p_office_codes; packet.office_name=actor_name; packet.office_completed_at=now();
   packet.status='completed'; event_action='office_completed';
 else raise exception 'Invalid compensation action';
 end if;
 if p_action in ('submit','approve','complete') then packet.pdf_path=p_pdf_path; packet.pdf_sha256=p_pdf_sha256; end if;
 packet.version=packet.version+1; packet.updated_at=now();
 update public.training_compensation_packets set data=packet.data,identity=packet.identity,status=packet.status,version=packet.version,
 receipts=packet.receipts,requester_signature=packet.requester_signature,mto_signature=packet.mto_signature,
 office_codes=packet.office_codes,office_name=packet.office_name,office_completed_at=packet.office_completed_at,
 pdf_path=packet.pdf_path,pdf_sha256=packet.pdf_sha256,review_note=packet.review_note,updated_at=packet.updated_at
 where id=packet.id;
 if event_action is not null then
   insert into public.training_compensation_events(packet_id,action,actor_id,actor_name,version,note,snapshot,pdf_path)
   values(packet.id,event_action,actor.id,actor_name,packet.version,trim(p_note),to_jsonb(packet),packet.pdf_path);
 end if;
 return packet;
end $$;
revoke all on function public.save_training_compensation(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.save_training_compensation(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text[]) to service_role;


notify pgrst,'reload schema';
commit;
