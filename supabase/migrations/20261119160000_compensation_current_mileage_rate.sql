begin;

-- Use the administrator-maintained current rate for compensation submissions.
-- Existing signed packets and their history are not rewritten.
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
   if actor.role not in ('mto','admin','deputy_chief') or packet.status<>'pending_office' then raise exception 'Office completion requires administrative privileges after MTO approval'; end if;
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
