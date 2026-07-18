-- Personnel signature storage metadata and approval snapshot preparation.

create table if not exists public.personnel_signatures (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null unique references public.personnel(id) on delete cascade,
  storage_bucket text not null default 'personnel-signatures',
  storage_path text not null,
  original_filename text,
  mime_type text not null,
  file_size_bytes bigint not null,
  image_width integer,
  image_height integer,
  certification_confirmed boolean not null,
  certified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_signatures_mime_type_check check (mime_type = 'image/png'),
  constraint personnel_signatures_file_size_bytes_check check (file_size_bytes > 0),
  constraint personnel_signatures_certification_confirmed_check check (certification_confirmed = true),
  constraint personnel_signatures_storage_path_check check (
    length(btrim(storage_path)) > 0
  )
);

alter table public.training_request_actions
  add column if not exists signature_storage_bucket text,
  add column if not exists signature_storage_path text,
  add column if not exists signature_sha256 text,
  add column if not exists signature_mime_type text,
  add column if not exists signature_file_size_bytes bigint;

comment on column public.training_request_actions.signature_storage_bucket is
  'Future approval snapshot: private storage bucket containing the exact signature image used for this approval action.';

comment on column public.training_request_actions.signature_storage_path is
  'Future approval snapshot: immutable storage path for the signature image copied at approval time.';

comment on column public.training_request_actions.signature_sha256 is
  'Future approval snapshot: SHA-256 hash of the signature bytes used for this approval action.';

comment on column public.training_request_actions.signature_mime_type is
  'Future approval snapshot: MIME type of the signature image copied at approval time.';

comment on column public.training_request_actions.signature_file_size_bytes is
  'Future approval snapshot: byte size of the signature image copied at approval time.';

create or replace function public.can_manage_own_personnel_signature()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_personnel_role() in ('mto', 'deputy_chief');
$$;

create or replace function public.expected_personnel_signature_storage_path(
  target_personnel_id uuid
)
returns text
language sql
immutable
set search_path = public
as $$
  select target_personnel_id::text || '/signature.png';
$$;

create or replace function public.is_personnel_signature_pending_object_path(
  object_name text,
  owner_id uuid
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  pending_prefix text;
  pending_file text;
begin
  if object_name is null or owner_id is null then
    return false;
  end if;

  pending_prefix := owner_id::text || '/pending/';
  if left(object_name, length(pending_prefix)) <> pending_prefix then
    return false;
  end if;

  pending_file := substring(object_name from length(pending_prefix) + 1);
  if pending_file is null or pending_file = '' then
    return false;
  end if;

  if pending_file ~ '[/\\]' or pending_file ~ '\.\.' then
    return false;
  end if;

  return pending_file ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
    or pending_file ~* '^backup-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$';
end;
$$;

create or replace function public.is_personnel_signature_owner_object_path(
  object_name text,
  owner_id uuid
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    object_name is not null
    and owner_id is not null
    and (
      object_name = public.expected_personnel_signature_storage_path(owner_id)
      or public.is_personnel_signature_pending_object_path(object_name, owner_id)
    );
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

  if owner_role not in ('mto', 'deputy_chief') then
    raise exception 'Only active MTO and Deputy Chief personnel may store signatures';
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

drop trigger if exists personnel_signatures_validate_owner on public.personnel_signatures;
create trigger personnel_signatures_validate_owner
before insert or update on public.personnel_signatures
for each row
execute function public.validate_personnel_signature_row();

drop trigger if exists personnel_signatures_set_updated_at on public.personnel_signatures;
create trigger personnel_signatures_set_updated_at
before update on public.personnel_signatures
for each row
execute function public.set_updated_at();

alter table public.personnel_signatures enable row level security;

drop policy if exists "personnel_signatures_select_own" on public.personnel_signatures;
drop policy if exists "personnel_signatures_insert_own" on public.personnel_signatures;
drop policy if exists "personnel_signatures_update_own" on public.personnel_signatures;
drop policy if exists "personnel_signatures_delete_own" on public.personnel_signatures;

create policy "personnel_signatures_select_own"
on public.personnel_signatures
for select
to authenticated
using (
  personnel_id = public.current_personnel_id()
  and public.can_manage_own_personnel_signature()
);

create policy "personnel_signatures_insert_own"
on public.personnel_signatures
for insert
to authenticated
with check (
  personnel_id = public.current_personnel_id()
  and public.can_manage_own_personnel_signature()
);

create policy "personnel_signatures_update_own"
on public.personnel_signatures
for update
to authenticated
using (
  personnel_id = public.current_personnel_id()
  and public.can_manage_own_personnel_signature()
)
with check (
  personnel_id = public.current_personnel_id()
  and public.can_manage_own_personnel_signature()
);

create policy "personnel_signatures_delete_own"
on public.personnel_signatures
for delete
to authenticated
using (
  personnel_id = public.current_personnel_id()
  and public.can_manage_own_personnel_signature()
);

grant select, insert, update, delete on table public.personnel_signatures to authenticated;

revoke all on function public.can_manage_own_personnel_signature() from public;
revoke all on function public.can_manage_own_personnel_signature() from anon;
grant execute on function public.can_manage_own_personnel_signature() to authenticated;

revoke all on function public.expected_personnel_signature_storage_path(uuid) from public;
revoke all on function public.expected_personnel_signature_storage_path(uuid) from anon;
grant execute on function public.expected_personnel_signature_storage_path(uuid) to authenticated;

revoke all on function public.is_personnel_signature_pending_object_path(text, uuid) from public;
revoke all on function public.is_personnel_signature_pending_object_path(text, uuid) from anon;
grant execute on function public.is_personnel_signature_pending_object_path(text, uuid) to authenticated;

revoke all on function public.is_personnel_signature_owner_object_path(text, uuid) from public;
revoke all on function public.is_personnel_signature_owner_object_path(text, uuid) from anon;
grant execute on function public.is_personnel_signature_owner_object_path(text, uuid) to authenticated;

revoke all on function public.validate_personnel_signature_row() from public;
revoke all on function public.validate_personnel_signature_row() from anon;
revoke all on function public.validate_personnel_signature_row() from authenticated;

comment on table public.personnel_signatures is
  'Metadata for active MTO and Deputy Chief personnel signature images stored in the private personnel-signatures bucket.';

comment on column public.personnel_signatures.certified_at is
  'Server-assigned timestamp when the owner certified the stored signature. Not trusted from browser input.';

comment on function public.can_manage_own_personnel_signature() is
  'Returns true when the authenticated active personnel role may manage a personal signature (mto or deputy_chief only).';

comment on function public.expected_personnel_signature_storage_path(uuid) is
  'Returns the owner final signature object path used by storage policies and metadata validation.';

comment on function public.is_personnel_signature_pending_object_path(text, uuid) is
  'Validates owner-scoped staged signature object paths under pending/ without path traversal.';

comment on function public.is_personnel_signature_owner_object_path(text, uuid) is
  'Validates final signature.png and owner-scoped pending staging paths for storage policies.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personnel-signatures',
  'personnel-signatures',
  false,
  1048576,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "personnel_signatures_storage_select_own" on storage.objects;
drop policy if exists "personnel_signatures_storage_insert_own" on storage.objects;
drop policy if exists "personnel_signatures_storage_update_own" on storage.objects;
drop policy if exists "personnel_signatures_storage_delete_own" on storage.objects;

create policy "personnel_signatures_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'personnel-signatures'
  and public.can_manage_own_personnel_signature()
  and (storage.foldername(name))[1] = public.current_personnel_id()::text
  and public.is_personnel_signature_owner_object_path(
    name,
    public.current_personnel_id()
  )
);

create policy "personnel_signatures_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'personnel-signatures'
  and public.can_manage_own_personnel_signature()
  and (storage.foldername(name))[1] = public.current_personnel_id()::text
  and public.is_personnel_signature_owner_object_path(
    name,
    public.current_personnel_id()
  )
);

create policy "personnel_signatures_storage_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'personnel-signatures'
  and public.can_manage_own_personnel_signature()
  and (storage.foldername(name))[1] = public.current_personnel_id()::text
  and public.is_personnel_signature_owner_object_path(
    name,
    public.current_personnel_id()
  )
)
with check (
  bucket_id = 'personnel-signatures'
  and public.can_manage_own_personnel_signature()
  and (storage.foldername(name))[1] = public.current_personnel_id()::text
  and public.is_personnel_signature_owner_object_path(
    name,
    public.current_personnel_id()
  )
);

create policy "personnel_signatures_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'personnel-signatures'
  and public.can_manage_own_personnel_signature()
  and (storage.foldername(name))[1] = public.current_personnel_id()::text
  and public.is_personnel_signature_owner_object_path(
    name,
    public.current_personnel_id()
  )
);
