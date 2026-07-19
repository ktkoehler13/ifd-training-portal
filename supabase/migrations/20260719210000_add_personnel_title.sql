alter table public.personnel
  add column if not exists title text;

update public.personnel
set title = 'firefighter'
where title is null;

alter table public.personnel
  alter column title set default 'firefighter';

alter table public.personnel
  alter column title set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint as c
    inner join pg_class as t on c.conrelid = t.oid
    inner join pg_namespace as n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'personnel'
      and c.conname = 'personnel_title_check'
  ) then
    alter table public.personnel
      add constraint personnel_title_check check (
        title in ('firefighter', 'lieutenant', 'assistant_chief')
      );
  end if;
end;
$$;

comment on column public.personnel.title is
  'Personnel rank (Firefighter, Lieutenant, Assistant Chief). Distinct from application role permissions stored in role.';
