-- Nullable for historical requests and incomplete drafts; no legacy backfill.
begin;

alter table public.training_requests
  add column if not exists other_expense_description text;

comment on column public.training_requests.other_expense_description is
  'Requester description of Other Expenses. Required when submitting a positive other_cost; null is valid on historical records and drafts.';

create or replace function public.validate_training_request_other_expense_description()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Validate submissions at the database boundary, including direct workflow RPCs.
  -- Existing pending/approved records can continue through the workflow unchanged.
  if new.other_cost > 0
    and coalesce(new.other_expense_description, '') !~ '[^[:space:]]'
  then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'returned_for_correction') then
        raise exception 'Describe Other Expense when Other Expenses is greater than $0.';
      end if;
    elsif old.status in ('draft', 'returned_for_correction')
      and new.status in ('submitted', 'pending_mto') then
      raise exception 'Describe Other Expense when Other Expenses is greater than $0.';
    end if;
  end if;
  return new;
end;
$$;

create trigger training_requests_validate_other_expense_description
before insert or update on public.training_requests
for each row execute function public.validate_training_request_other_expense_description();

revoke all on function public.validate_training_request_other_expense_description() from public, anon, authenticated;

commit;
