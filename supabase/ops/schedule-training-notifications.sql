-- Run after deploying send-training-request-notifications with JWT verification
-- enabled and configuring/validating its sender. Store these two existing
-- project values through the Supabase Vault dashboard first (never in Git):
--   training_notifications_project_url: the project's https://...supabase.co URL
--   training_notifications_service_role: this project's service-role key
-- NOTIFICATIONS_ENABLED must remain false until the sender is verified and
-- NOTIFICATIONS_START_AT is set to the intended activation time.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='training_notifications_project_url')
    or not exists(select 1 from vault.decrypted_secrets where name='training_notifications_service_role') then
    raise exception 'Configure the two training notification Vault secrets before scheduling';
  end if;
end;
$$;

create or replace function public.dispatch_training_request_notification_emails()
returns void language plpgsql security definer set search_path = '' as $$
declare project_url text; service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets
    where name='training_notifications_project_url';
  select decrypted_secret into service_key from vault.decrypted_secrets
    where name='training_notifications_service_role';
  if project_url is null or service_key is null then
    raise exception 'Training notification dispatcher is not configured';
  end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-training-request-notifications',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || service_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.dispatch_training_request_notification_emails() from public, anon, authenticated;
grant execute on function public.dispatch_training_request_notification_emails() to service_role;

-- Reusing this job name updates it instead of creating duplicate schedules.
select cron.schedule('send-training-request-notifications', '* * * * *',
  'select public.dispatch_training_request_notification_emails();');
commit;
