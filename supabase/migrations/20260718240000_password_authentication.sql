-- IFD Training Portal: password authentication support and active badge uniqueness

create unique index if not exists personnel_active_badge_number_unique
  on public.personnel (lower(trim(badge_number)))
  where active = true;

comment on index public.personnel_active_badge_number_unique is
  'Prevents two active personnel records from sharing the same normalized badge number.';

revoke all on function public.personnel_login_allowed(text, text) from anon;

comment on function public.personnel_login_allowed(text, text) is
  'Legacy magic-link pre-check. Revoked from anonymous callers after password authentication.';
