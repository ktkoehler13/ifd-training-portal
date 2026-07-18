-- IFD Training Portal Phase 2: approval signature snapshots and approved PDF packets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-request-signature-snapshots',
  'training-request-signature-snapshots',
  false,
  1048576,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-request-packets',
  'training-request-packets',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Immutable approval snapshots and generated packets are written only by trusted server code
-- using the service role. These buckets stay private; no authenticated storage policies are
-- required because the browser never uploads or reads snapshot or packet objects directly.

create table if not exists public.training_request_signature_action_reservations (
  id uuid primary key default gen_random_uuid(),
  training_request_id uuid not null references public.training_requests(id) on delete cascade,
  actor_personnel_id uuid not null references public.personnel(id) on delete cascade,
  actor_name text not null,
  actor_badge_number text not null,
  actor_role text not null,
  actor_auth_user_id uuid,
  expected_action text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  constraint training_request_signature_action_reservations_expected_action_check check (
    expected_action in (
      'mto_approved',
      'mto_denied',
      'deputy_chief_approved',
      'deputy_chief_denied'
    )
  ),
  constraint training_request_signature_action_reservations_actor_role_check check (
    actor_role in ('mto', 'deputy_chief')
  ),
  constraint training_request_signature_action_reservations_actor_name_check check (
    length(btrim(actor_name)) > 0
  ),
  constraint training_request_signature_action_reservations_actor_badge_check check (
    length(btrim(actor_badge_number)) > 0
  )
);

create index if not exists training_request_signature_action_reservations_request_actor_idx
  on public.training_request_signature_action_reservations (training_request_id, actor_personnel_id);

create table if not exists public.training_request_packets (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.training_requests(id) on delete cascade,
  storage_bucket text not null default 'training-request-packets',
  storage_path text not null,
  filename text not null,
  sha256 text,
  file_size_bytes bigint,
  status text not null,
  generation_attempts integer not null default 0,
  last_error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_request_packets_status_check check (
    status in ('pending', 'processing', 'ready', 'failed')
  ),
  constraint training_request_packets_storage_bucket_check check (
    storage_bucket = 'training-request-packets'
  ),
  constraint training_request_packets_storage_path_check check (
    length(btrim(storage_path)) > 0
  ),
  constraint training_request_packets_filename_check check (
    length(btrim(filename)) > 0
  ),
  constraint training_request_packets_generation_attempts_check check (
    generation_attempts >= 0
  ),
  constraint training_request_packets_sha256_format_check check (
    sha256 is null
    or sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint training_request_packets_ready_metadata_check check (
    status <> 'ready'
    or (
      generated_at is not null
      and sha256 is not null
      and sha256 ~ '^[0-9a-f]{64}$'
      and file_size_bytes is not null
      and file_size_bytes > 0
    )
  )
);

create index if not exists training_request_packets_status_idx
  on public.training_request_packets (status, updated_at);

drop trigger if exists training_request_packets_set_updated_at on public.training_request_packets;
create trigger training_request_packets_set_updated_at
before update on public.training_request_packets
for each row
execute function public.set_updated_at();

create or replace function public.expected_training_request_signature_snapshot_storage_path(
  p_training_request_id uuid,
  p_reservation_id uuid
)
returns text
language sql
immutable
set search_path = public
as $$
  select p_training_request_id::text || '/' || p_reservation_id::text || '/signature.png';
$$;

create or replace function public.expected_training_request_packet_storage_path(
  p_request_id uuid
)
returns text
language sql
immutable
set search_path = public
as $$
  select p_request_id::text || '/approved-packet.pdf';
$$;

create or replace function public.validate_signature_snapshot_metadata(
  p_training_request_id uuid,
  p_reservation_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_sha256 text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_storage_bucket <> 'training-request-signature-snapshots' then
    raise exception 'Invalid signature snapshot storage bucket';
  end if;

  if p_storage_path is distinct from public.expected_training_request_signature_snapshot_storage_path(
    p_training_request_id,
    p_reservation_id
  ) then
    raise exception 'Invalid signature snapshot storage path';
  end if;

  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Signature snapshot SHA-256 must be a lowercase 64-character hexadecimal string';
  end if;

  if p_mime_type <> 'image/png' then
    raise exception 'Signature snapshots must be PNG images';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'Signature snapshot file size must be greater than zero';
  end if;
end;
$$;

create or replace function public.require_personnel_signature_for_workflow_action(
  p_personnel_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.personnel_signatures as ps
    where ps.personnel_id = p_personnel_id
  ) then
    raise exception 'You must save your signature before signing this training request action.';
  end if;
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

  if p_actor_role not in ('mto', 'deputy_chief', 'admin', 'firefighter') then
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

create or replace function public.upsert_training_request_packet_pending(
  p_request_id uuid
)
returns public.training_request_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.training_requests;
  packet_row public.training_request_packets;
  packet_filename text;
begin
  select *
  into request_row
  from public.training_requests
  where id = p_request_id;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if request_row.status <> 'approved' then
    raise exception 'Approved packet metadata may only be created for approved requests';
  end if;

  packet_filename := coalesce(nullif(btrim(request_row.request_number), ''), 'Draft') || '.pdf';

  insert into public.training_request_packets (
    request_id,
    storage_bucket,
    storage_path,
    filename,
    status
  )
  values (
    p_request_id,
    'training-request-packets',
    public.expected_training_request_packet_storage_path(p_request_id),
    packet_filename,
    'pending'
  )
  on conflict (request_id) do update
  set
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    filename = excluded.filename,
    status = case
      when public.training_request_packets.status = 'ready' then public.training_request_packets.status
      else 'pending'
    end,
    last_error = case
      when public.training_request_packets.status = 'ready' then public.training_request_packets.last_error
      else null
    end
  returning * into packet_row;

  return packet_row;
end;
$$;

create or replace function public.mark_training_request_packet_processing(
  p_request_id uuid
)
returns public.training_request_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  packet_row public.training_request_packets;
begin
  update public.training_request_packets
  set
    status = 'processing',
    generation_attempts = generation_attempts + 1,
    last_error = null
  where request_id = p_request_id
  returning * into packet_row;

  if packet_row.id is null then
    raise exception 'Training request packet not found';
  end if;

  return packet_row;
end;
$$;

create or replace function public.mark_training_request_packet_ready(
  p_request_id uuid,
  p_sha256 text,
  p_file_size_bytes bigint
)
returns public.training_request_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  packet_row public.training_request_packets;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Packet SHA-256 must be a lowercase 64-character hexadecimal string';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'Packet file size must be greater than zero';
  end if;

  update public.training_request_packets
  set
    status = 'ready',
    sha256 = p_sha256,
    file_size_bytes = p_file_size_bytes,
    generated_at = now(),
    last_error = null
  where request_id = p_request_id
  returning * into packet_row;

  if packet_row.id is null then
    raise exception 'Training request packet not found';
  end if;

  return packet_row;
end;
$$;

create or replace function public.mark_training_request_packet_failed(
  p_request_id uuid,
  p_last_error text
)
returns public.training_request_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  packet_row public.training_request_packets;
begin
  update public.training_request_packets
  set
    status = 'failed',
    last_error = nullif(btrim(coalesce(p_last_error, '')), '')
  where request_id = p_request_id
  returning * into packet_row;

  if packet_row.id is null then
    raise exception 'Training request packet not found';
  end if;

  return packet_row;
end;
$$;

create or replace function public.reserve_training_request_signature_action(
  p_request_id uuid,
  p_expected_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  request_row public.training_requests;
  reservation_id uuid;
begin
  if p_expected_action not in (
    'mto_approved',
    'mto_denied',
    'deputy_chief_approved',
    'deputy_chief_denied'
  ) then
    raise exception 'Unsupported signature workflow action: %', p_expected_action;
  end if;

  select *
  into actor
  from public.get_current_personnel_actor();

  select *
  into request_row
  from public.training_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  if p_expected_action in ('mto_approved', 'mto_denied') then
    if actor.actor_role <> 'mto' then
      raise exception 'Only active MTO personnel may perform this action at the MTO review step';
    end if;

    if request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto' then
      raise exception 'Training request is not awaiting MTO review';
    end if;
  elsif p_expected_action in ('deputy_chief_approved', 'deputy_chief_denied') then
    if actor.actor_role <> 'deputy_chief' then
      raise exception 'Only active Deputy Chief personnel may perform this action at the Deputy Chief review step';
    end if;

    if request_row.status <> 'pending_deputy_chief'
      or request_row.current_action_role <> 'deputy_chief' then
      raise exception 'Training request is not awaiting Deputy Chief review';
    end if;
  end if;

  perform public.require_personnel_signature_for_workflow_action(actor.personnel_id);

  if actor.actor_name is null or btrim(actor.actor_name) = '' then
    raise exception 'Your personnel profile must include a first and last name before performing this action';
  end if;

  insert into public.training_request_signature_action_reservations (
    training_request_id,
    actor_personnel_id,
    actor_name,
    actor_badge_number,
    actor_role,
    actor_auth_user_id,
    expected_action
  )
  values (
    p_request_id,
    actor.personnel_id,
    actor.actor_name,
    actor.badge_number,
    actor.actor_role,
    auth.uid(),
    p_expected_action
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

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
begin
  if coalesce(p_electronic_signature_confirmed, false) is distinct from true then
    raise exception 'Electronic signature acknowledgment is required to complete this action';
  end if;

  select *
  into reservation_row
  from public.training_request_signature_action_reservations
  where id = p_reservation_id
  for update;

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

  select *
  into request_row
  from public.training_requests
  where id = reservation_row.training_request_id
  for update;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  perform public.validate_signature_snapshot_metadata(
    reservation_row.training_request_id,
    reservation_row.id,
    p_signature_storage_bucket,
    p_signature_storage_path,
    p_signature_sha256,
    p_signature_mime_type,
    p_signature_file_size_bytes
  );

  if reservation_row.expected_action in ('mto_approved', 'mto_denied') then
    if reservation_row.actor_role <> 'mto' then
      raise exception 'Only active MTO personnel may complete this action at the MTO review step';
    end if;

    if request_row.status <> 'pending_mto' or request_row.current_action_role <> 'mto' then
      raise exception 'Training request is not awaiting MTO review';
    end if;
  elsif reservation_row.expected_action in ('deputy_chief_approved', 'deputy_chief_denied') then
    if reservation_row.actor_role <> 'deputy_chief' then
      raise exception 'Only active Deputy Chief personnel may complete this action at the Deputy Chief review step';
    end if;

    if request_row.status <> 'pending_deputy_chief'
      or request_row.current_action_role <> 'deputy_chief' then
      raise exception 'Training request is not awaiting Deputy Chief review';
    end if;
  end if;

  case reservation_row.expected_action
    when 'mto_approved' then
      update public.training_requests
      set
        status = 'pending_deputy_chief',
        current_action_role = 'deputy_chief'
      where id = request_row.id
      returning * into request_row;

      action_row := public.insert_training_request_signature_action(
        reservation_row.id,
        request_row.id,
        'mto_approved',
        reservation_row.actor_personnel_id,
        reservation_row.actor_name,
        reservation_row.actor_badge_number,
        reservation_row.actor_role,
        p_comments,
        reservation_row.actor_name,
        now(),
        true,
        p_signature_storage_bucket,
        p_signature_storage_path,
        p_signature_sha256,
        p_signature_mime_type,
        p_signature_file_size_bytes
      );

      notification_event_type := 'pending_deputy_chief';
    when 'mto_denied' then
      perform public.require_training_request_action_comments(
        p_comments,
        'Deny request'
      );

      update public.training_requests
      set
        status = 'denied',
        current_action_role = null
      where id = request_row.id
      returning * into request_row;

      action_row := public.insert_training_request_signature_action(
        reservation_row.id,
        request_row.id,
        'mto_denied',
        reservation_row.actor_personnel_id,
        reservation_row.actor_name,
        reservation_row.actor_badge_number,
        reservation_row.actor_role,
        p_comments,
        reservation_row.actor_name,
        now(),
        true,
        p_signature_storage_bucket,
        p_signature_storage_path,
        p_signature_sha256,
        p_signature_mime_type,
        p_signature_file_size_bytes
      );

      notification_event_type := 'denied';
    when 'deputy_chief_approved' then
      update public.training_requests
      set
        status = 'approved',
        current_action_role = null
      where id = request_row.id
      returning * into request_row;

      action_row := public.insert_training_request_signature_action(
        reservation_row.id,
        request_row.id,
        'deputy_chief_approved',
        reservation_row.actor_personnel_id,
        reservation_row.actor_name,
        reservation_row.actor_badge_number,
        reservation_row.actor_role,
        p_comments,
        reservation_row.actor_name,
        now(),
        true,
        p_signature_storage_bucket,
        p_signature_storage_path,
        p_signature_sha256,
        p_signature_mime_type,
        p_signature_file_size_bytes
      );

      notification_event_type := 'approved';
    when 'deputy_chief_denied' then
      perform public.require_training_request_action_comments(
        p_comments,
        'Deny request'
      );

      update public.training_requests
      set
        status = 'denied',
        current_action_role = null
      where id = request_row.id
      returning * into request_row;

      action_row := public.insert_training_request_signature_action(
        reservation_row.id,
        request_row.id,
        'deputy_chief_denied',
        reservation_row.actor_personnel_id,
        reservation_row.actor_name,
        reservation_row.actor_badge_number,
        reservation_row.actor_role,
        p_comments,
        reservation_row.actor_name,
        now(),
        true,
        p_signature_storage_bucket,
        p_signature_storage_path,
        p_signature_sha256,
        p_signature_mime_type,
        p_signature_file_size_bytes
      );

      notification_event_type := 'denied';
    else
      raise exception 'Unsupported signature workflow action: %', reservation_row.expected_action;
  end case;

  update public.training_request_signature_action_reservations
  set consumed_at = now()
  where id = reservation_row.id;

  perform public.enqueue_training_request_notifications(
    request_row.id,
    action_row.id,
    notification_event_type
  );

  if reservation_row.expected_action = 'deputy_chief_approved' then
    perform public.upsert_training_request_packet_pending(request_row.id);
  end if;

  return request_row;
end;
$$;

alter table public.training_request_signature_action_reservations enable row level security;
alter table public.training_request_packets enable row level security;

revoke all on table public.training_request_signature_action_reservations from public;
revoke all on table public.training_request_signature_action_reservations from anon;
revoke all on table public.training_request_signature_action_reservations from authenticated;

drop policy if exists "training_request_packets_select_own" on public.training_request_packets;
drop policy if exists "training_request_packets_select_administrator" on public.training_request_packets;
drop policy if exists "training_request_packets_insert" on public.training_request_packets;
drop policy if exists "training_request_packets_update" on public.training_request_packets;
drop policy if exists "training_request_packets_delete" on public.training_request_packets;

create policy "training_request_packets_select_own"
on public.training_request_packets
for select
to authenticated
using (
  exists (
    select 1
    from public.training_requests as tr
    where tr.id = training_request_packets.request_id
      and tr.requester_personnel_id = public.current_personnel_id()
  )
);

create policy "training_request_packets_select_administrator"
on public.training_request_packets
for select
to authenticated
using (
  public.is_personnel_administrator()
);

grant select on table public.training_request_packets to authenticated;

revoke all on function public.expected_training_request_signature_snapshot_storage_path(uuid, uuid) from public;
revoke all on function public.expected_training_request_signature_snapshot_storage_path(uuid, uuid) from anon;
revoke all on function public.expected_training_request_signature_snapshot_storage_path(uuid, uuid) from authenticated;

revoke all on function public.expected_training_request_packet_storage_path(uuid) from public;
revoke all on function public.expected_training_request_packet_storage_path(uuid) from anon;
revoke all on function public.expected_training_request_packet_storage_path(uuid) from authenticated;

revoke all on function public.validate_signature_snapshot_metadata(uuid, uuid, text, text, text, text, bigint) from public;
revoke all on function public.validate_signature_snapshot_metadata(uuid, uuid, text, text, text, text, bigint) from anon;
revoke all on function public.validate_signature_snapshot_metadata(uuid, uuid, text, text, text, text, bigint) from authenticated;

revoke all on function public.require_personnel_signature_for_workflow_action(uuid) from public;
revoke all on function public.require_personnel_signature_for_workflow_action(uuid) from anon;
revoke all on function public.require_personnel_signature_for_workflow_action(uuid) from authenticated;

revoke all on function public.insert_training_request_signature_action(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from public;
revoke all on function public.insert_training_request_signature_action(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from anon;
revoke all on function public.insert_training_request_signature_action(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from authenticated;

revoke all on function public.upsert_training_request_packet_pending(uuid) from public;
revoke all on function public.upsert_training_request_packet_pending(uuid) from anon;
revoke all on function public.upsert_training_request_packet_pending(uuid) from authenticated;

revoke all on function public.mark_training_request_packet_processing(uuid) from public;
revoke all on function public.mark_training_request_packet_processing(uuid) from anon;
revoke all on function public.mark_training_request_packet_processing(uuid) from authenticated;

revoke all on function public.mark_training_request_packet_ready(uuid, text, bigint) from public;
revoke all on function public.mark_training_request_packet_ready(uuid, text, bigint) from anon;
revoke all on function public.mark_training_request_packet_ready(uuid, text, bigint) from authenticated;

revoke all on function public.mark_training_request_packet_failed(uuid, text) from public;
revoke all on function public.mark_training_request_packet_failed(uuid, text) from anon;
revoke all on function public.mark_training_request_packet_failed(uuid, text) from authenticated;

revoke execute on function public.mto_approve_training_request(uuid, text, boolean) from authenticated;
revoke execute on function public.mto_deny_training_request(uuid, text) from authenticated;
revoke execute on function public.deputy_approve_training_request(uuid, text, boolean) from authenticated;
revoke execute on function public.deputy_deny_training_request(uuid, text) from authenticated;

revoke all on function public.reserve_training_request_signature_action(uuid, text) from public;
revoke all on function public.complete_training_request_signature_action(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from public;

grant execute on function public.reserve_training_request_signature_action(uuid, text) to authenticated;

revoke execute on function public.complete_training_request_signature_action(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from public;
revoke execute on function public.complete_training_request_signature_action(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from anon;
revoke execute on function public.complete_training_request_signature_action(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) from authenticated;

grant execute on function public.insert_training_request_signature_action(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) to service_role;
grant execute on function public.complete_training_request_signature_action(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  text,
  bigint
) to service_role;

grant execute on function public.upsert_training_request_packet_pending(uuid) to service_role;
grant execute on function public.mark_training_request_packet_processing(uuid) to service_role;
grant execute on function public.mark_training_request_packet_ready(uuid, text, bigint) to service_role;
grant execute on function public.mark_training_request_packet_failed(uuid, text) to service_role;

grant select, insert, update, delete on table public.training_request_packets to service_role;
grant select, insert, update on table public.training_request_signature_action_reservations to service_role;

comment on table public.training_request_signature_action_reservations is
  'Short-lived reservations that assign action IDs and immutable reviewer identity snapshots before signature upload. Consumed only by the service-role completion RPC.';

comment on column public.training_request_signature_action_reservations.actor_auth_user_id is
  'Optional auth.users correlation captured at reservation time for audit purposes.';

comment on table public.training_request_packets is
  'Metadata for server-generated approved PDF packets stored in the private training-request-packets bucket. Browser users may read metadata through RLS but cannot write rows directly.';

comment on column public.training_request_actions.signature_storage_bucket is
  'Immutable approval snapshot: private storage bucket containing the exact signature image copied at action time.';

comment on column public.training_request_actions.signature_storage_path is
  'Immutable approval snapshot: storage path <request-id>/<action-id>/signature.png copied at action time.';

comment on column public.training_request_actions.signature_sha256 is
  'Immutable approval snapshot: SHA-256 hash of the signature bytes copied at action time.';

comment on column public.training_request_actions.signature_mime_type is
  'Immutable approval snapshot: MIME type of the signature image copied at action time.';

comment on column public.training_request_actions.signature_file_size_bytes is
  'Immutable approval snapshot: byte size of the signature image copied at action time.';

comment on function public.validate_signature_snapshot_metadata(uuid, uuid, text, text, text, text, bigint) is
  'Validates trusted signature snapshot metadata for the private training-request-signature-snapshots bucket.';

comment on function public.reserve_training_request_signature_action(uuid, text) is
  'Reserves an action ID and validates reviewer role, request state, and stored personnel signature before snapshot upload.';

comment on function public.complete_training_request_signature_action(uuid, text, boolean, text, text, text, text, bigint) is
  'Service-role-only completion RPC. Uses reservation identity snapshots and trusted snapshot metadata after server-side upload verification.';

comment on function public.upsert_training_request_packet_pending(uuid) is
  'Creates or resets approved packet metadata to pending after Deputy Chief approval. Intended for trusted server processes.';

comment on function public.mark_training_request_packet_processing(uuid) is
  'Marks an approved packet row as processing and increments generation attempts. Service role only.';

comment on function public.mark_training_request_packet_ready(uuid, text, bigint) is
  'Marks an approved packet row ready with SHA-256 and byte size after successful server-side PDF generation. Service role only.';

comment on function public.mark_training_request_packet_failed(uuid, text) is
  'Marks an approved packet row failed while leaving the training request approved. Service role only.';
