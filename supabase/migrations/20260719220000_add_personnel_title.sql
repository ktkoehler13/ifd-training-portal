alter table public.personnel
add column if not exists title text not null default 'firefighter';

alter table public.personnel
drop constraint if exists personnel_title_check;

alter table public.personnel
add constraint personnel_title_check
check (
  title in (
    'firefighter',
    'lieutenant',
    'assistant_chief'
  )
);

comment on column public.personnel.title is
  'Department rank or title, separate from the application authorization role.';
