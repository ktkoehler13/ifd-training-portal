begin;

-- Request snapshots, not profile data. Existing requests remain nullable.
alter table public.training_requests
  add column requester_address text,
  add column requester_city text,
  add column requester_state text,
  add column requester_zip text,
  add column requester_phone text,
  add column ny_training_id text;

comment on column public.training_requests.ny_training_id is
  'Student-entered New York Training ID for this OFPC request. Stored as text to preserve leading zeroes; required on new submissions/resubmissions, nullable on historical records.';
comment on column public.training_requests.requester_address is
  'Student street address including unit, captured for this request and its TAL. Editable only in draft or returned-for-correction status.';

create function public.validate_state_course_student_details()
returns trigger language plpgsql set search_path = public as $$
declare
  requires_details boolean := false;
  field_name text;
  field_value text;
  maximum_length integer;
begin
  if tg_op = 'UPDATE' then
    if old.status not in ('draft', 'returned_for_correction') then
      if row(new.requester_address, new.requester_city, new.requester_state,
             new.requester_zip, new.requester_phone, new.ny_training_id)
        is distinct from
         row(old.requester_address, old.requester_city, old.requester_state,
             old.requester_zip, old.requester_phone, old.ny_training_id) then
        raise exception 'Student details can only be edited in a draft or a request returned for correction.';
      end if;
      -- Do not revalidate historical pending/approved requests during approval.
      return new;
    end if;
    requires_details := new.status in ('submitted', 'pending_mto');
  else
    requires_details := new.status not in ('draft', 'returned_for_correction');
  end if;

  if new.is_ofpc_course is not true then
    new.requester_address := null; new.requester_city := null;
    new.requester_state := null; new.requester_zip := null;
    new.requester_phone := null; new.ny_training_id := null;
    return new;
  end if;

  new.requester_address := nullif(btrim(regexp_replace(new.requester_address, '[[:space:]]+', ' ', 'g')), '');
  new.requester_city := nullif(btrim(regexp_replace(new.requester_city, '[[:space:]]+', ' ', 'g')), '');
  new.requester_state := upper(nullif(btrim(new.requester_state), ''));
  new.requester_zip := nullif(btrim(new.requester_zip), '');
  new.requester_phone := nullif(btrim(regexp_replace(new.requester_phone, '[[:space:]]+', ' ', 'g')), '');
  new.ny_training_id := nullif(btrim(regexp_replace(new.ny_training_id, '[[:space:]]+', ' ', 'g')), '');

  for field_name, field_value, maximum_length in
    select * from (values
      ('Street Address', new.requester_address, 160),
      ('City', new.requester_city, 80), ('State', new.requester_state, 2),
      ('ZIP Code', new.requester_zip, 10), ('Phone Number', new.requester_phone, 40),
      ('New York Training ID', new.ny_training_id, 64)
    ) as fields(label, value, maximum)
  loop
    if requires_details and field_value is null then
      raise exception '% is required for OFPC courses.', field_name;
    end if;
    if length(field_value) > maximum_length then
      raise exception '% must be % characters or fewer.', field_name, maximum_length;
    end if;
  end loop;

  if requires_details then
    if new.requester_state !~ '^[A-Z]{2}$' then
      raise exception 'Enter a two-letter state abbreviation, such as NY.';
    end if;
    if new.requester_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then
      raise exception 'Enter a ZIP code such as 14850 or 14850-1234.';
    end if;
    if length(regexp_replace(new.requester_phone, '[^0-9]', '', 'g')) not between 10 and 15
      or new.requester_phone !~ '^[+0-9().[:space:]-]+$' then
      raise exception 'Enter a phone number with area code (10-15 digits).';
    end if;
  end if;
  return new;
end;
$$;

create trigger training_requests_validate_state_course_details
before insert or update on public.training_requests
for each row execute function public.validate_state_course_student_details();

revoke all on function public.validate_state_course_student_details() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
