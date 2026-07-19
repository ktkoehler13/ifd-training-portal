-- IFD Training Portal: legacy magic-link password setup transition

alter table public.personnel
  add column if not exists must_change_password boolean not null default false;

alter table public.personnel
  add column if not exists password_setup_completed_at timestamptz null;

comment on column public.personnel.password_setup_completed_at is
  'Timestamp when the user completed first password setup. Null for legacy accounts that have not yet created a password.';

-- Reviewed one-time backfill for the magic-link to badge/password transition.
-- Do not run automatically during migration apply.
--
-- Intended use:
-- - one-time conversion from magic-link-only accounts
-- - every affected active account will be forced through password setup
-- - administrators who already received working temporary passwords may need to
--   be excluded from this update or reset afterward
--
-- update public.personnel
-- set must_change_password = true
-- where active = true
--   and must_change_password = false;
