-- IFD Training Portal: secure deletion of owned draft training requests

create or replace function public.delete_own_training_request_draft(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  personnel_id uuid;
  request_row public.training_requests;
  deleted_id uuid;
begin
  personnel_id := public.current_personnel_id();

  if personnel_id is null then
    raise exception 'Active authenticated personnel record required';
  end if;

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.requester_personnel_id <> personnel_id then
    raise exception 'Only the requester may delete this draft training request';
  end if;

  if request_row.status <> 'draft' then
    raise exception 'Only draft training requests may be deleted';
  end if;

  delete from public.training_requests
  where id = p_request_id
  returning id into deleted_id;

  return deleted_id;
end;
$$;

revoke all on function public.delete_own_training_request_draft(uuid) from public;
revoke all on function public.delete_own_training_request_draft(uuid) from anon;

grant execute on function public.delete_own_training_request_draft(uuid) to authenticated;

comment on function public.delete_own_training_request_draft(uuid) is
  'Permanently deletes one owned draft training request. Enforces requester ownership and draft status through current_personnel_id().';
