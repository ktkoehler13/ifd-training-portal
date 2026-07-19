-- IFD Training Portal: require password change after administrator resets

alter table public.personnel
  add column if not exists must_change_password boolean not null default false;

comment on column public.personnel.must_change_password is
  'When true, the user must replace their temporary password before accessing normal application pages.';
