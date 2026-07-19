alter table public.personnel
add column if not exists password_setup_completed_at timestamptz null;

comment on column public.personnel.password_setup_completed_at is
  'Timestamp when the user successfully established or replaced their permanent password.';
