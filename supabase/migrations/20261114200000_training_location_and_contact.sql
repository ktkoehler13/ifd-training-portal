begin;

alter table public.training_requests
  add column request_contact_email text,
  add column location_type text check (location_type in ('nys_fire_academy','sptc','other')),
  add column academy_meal_days integer check (academy_meal_days between 0 and 366),
  add column academy_ssn_last4 text check (academy_ssn_last4 ~ '^[0-9]{4}$');

create function public.validate_training_location_and_contact()
returns trigger language plpgsql set search_path = public as $$
declare submitting boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status not in ('draft','returned_for_correction') then
      if row(new.request_contact_email,new.location_type,new.academy_meal_days,new.academy_ssn_last4)
        is distinct from row(old.request_contact_email,old.location_type,old.academy_meal_days,old.academy_ssn_last4) then
        raise exception 'Request contact and Academy details can only be edited in a draft or a request returned for correction.';
      end if;
      return new;
    end if;
  end if;
  submitting := new.status not in ('draft','returned_for_correction');
  new.request_contact_email := nullif(lower(btrim(new.request_contact_email)), '');
  if new.request_contact_email is not null and (length(new.request_contact_email)>254
    or new.request_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid contact email for this request.';
  end if;
  if new.location_type = 'nys_fire_academy' then
    new.location := 'NYS Fire Academy';
    new.academy_ssn_last4 := nullif(btrim(new.academy_ssn_last4), '');
    if submitting and (new.is_ofpc_course is not true or new.academy_meal_days is null) then
      raise exception 'Academy requests require OFPC course information and a valid commuter meal-day count.';
    end if;
    if submitting and new.academy_ssn_last4 is null then
      raise exception 'Enter exactly the last four digits of your SSN for Academy registration.';
    end if;
  else
    new.academy_meal_days := null;
    new.academy_ssn_last4 := null;
    if new.location_type = 'sptc' then new.location := 'SPTC'; end if;
  end if;
  if new.location_type is not null and submitting and (length(btrim(new.location))=0 or length(new.location)>300) then
    raise exception 'Enter a training location (300 characters or fewer).';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_training_location_and_contact() from public, anon, authenticated;
create trigger training_requests_validate_location_contact before insert or update on public.training_requests
for each row execute function public.validate_training_location_and_contact();

comment on column public.training_requests.request_contact_email is 'Requester-selected email for this request and its forms; does not change account identity. Null historical records retain existing recipient routing.';
comment on column public.training_requests.academy_meal_days is 'Commuter meal days used for an editable $8/day Academy estimate. Final approved expense amounts remain authoritative.';
comment on column public.training_requests.academy_ssn_last4 is 'Last four SSN digits only, supplied for this Academy registration. Same private request access controls; never copied to a profile, audit text, or email body.';

create or replace function public.enqueue_training_request_notifications(
  p_training_request_id uuid,
  p_source_action_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.training_requests;
  notification_copy record;
begin
  select *
  into request_row
  from public.training_requests
  where id = p_training_request_id;

  if request_row.id is null then
    raise exception 'Training request not found';
  end if;

  select *
  into notification_copy
  from public.build_training_request_notification_copy(p_event_type, request_row);

  if p_event_type = 'pending_mto' then
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    select
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      p.email,
      p.id,
      notification_copy.subject,
      notification_copy.message_text
    from public.personnel as p
    where p.active = true
      and p.role = 'mto'
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  elsif p_event_type = 'pending_deputy_chief' then
    -- Serialize routing with recipient changes so newly queued alerts cannot
    -- miss both the old and the new recipient during a settings update.
    perform 1 from public.system_settings
      where key = 'primary_approval_deputy_chief' for share;
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    select
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      p.email,
      p.id,
      notification_copy.subject,
      notification_copy.message_text
    from public.personnel as p
    where p.active = true
      and p.role = 'deputy_chief'
      and public.receives_deputy_approval_notifications(p.id)
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  else
    insert into public.training_request_notifications (
      training_request_id,
      source_action_id,
      event_type,
      recipient_email,
      recipient_personnel_id,
      subject,
      message_text
    )
    values (
      p_training_request_id,
      p_source_action_id,
      p_event_type,
      coalesce(
        request_row.request_contact_email,
        (
          select p.email
          from public.personnel as p
          where p.id = request_row.requester_personnel_id
            and p.active = true
          limit 1
        ),
        request_row.requester_email
      ),
      request_row.requester_personnel_id,
      notification_copy.subject,
      notification_copy.message_text
    )
    on conflict (source_action_id, event_type, recipient_email) do nothing;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
