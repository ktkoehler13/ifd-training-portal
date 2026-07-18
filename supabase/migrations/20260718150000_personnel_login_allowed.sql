-- Allow anonymous login pre-check without exposing personnel details.

create or replace function public.personnel_login_allowed(
  requested_badge_number text,
  requested_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.personnel as p
    where p.active = true
      and trim(p.badge_number) = trim(coalesce(requested_badge_number, ''))
      and lower(trim(p.email)) = lower(trim(coalesce(requested_email, '')))
      and trim(coalesce(requested_badge_number, '')) <> ''
      and trim(coalesce(requested_email, '')) <> ''
  );
$$;

revoke all on function public.personnel_login_allowed(text, text) from public;
grant execute on function public.personnel_login_allowed(text, text) to anon;
grant execute on function public.personnel_login_allowed(text, text) to authenticated;

comment on function public.personnel_login_allowed(text, text) is
  'Returns true only when an active personnel record matches the requested badge number and email. Returns false for blank values and never exposes personnel details.';
