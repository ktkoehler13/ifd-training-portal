begin;

-- Keep suppressed alerts visible to administrators without misreporting them as sent.
alter table public.training_request_notifications
  drop constraint training_request_notifications_status_check;
alter table public.training_request_notifications
  add constraint training_request_notifications_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

comment on column public.training_request_notifications.status is
  'Delivery state. Skipped alerts were deliberately suppressed (before activation, superseded workflow action, or recipient no longer eligible). No email was sent.';

-- Validate the caller through PostgREST, which verifies project credentials.
-- This accepts valid rotated service keys as well as the current default key.
create or replace function public.training_notification_dispatch_authorized()
returns boolean language sql stable security invoker set search_path = '' as $$
  select current_user = 'service_role';
$$;
revoke all on function public.training_notification_dispatch_authorized() from public, anon, authenticated;
grant execute on function public.training_notification_dispatch_authorized() to service_role;

commit;
