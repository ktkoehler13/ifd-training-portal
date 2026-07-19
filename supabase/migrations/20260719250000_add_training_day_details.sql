-- Separate total training/travel days from on-duty day count and on-duty dates.

alter table public.training_requests
  add column if not exists total_days_including_travel integer;

alter table public.training_requests
  add column if not exists on_duty_dates date[] not null default '{}';

alter table public.training_requests
  drop constraint if exists training_requests_total_days_including_travel_check;

alter table public.training_requests
  add constraint training_requests_total_days_including_travel_check
  check (
    total_days_including_travel is null
    or total_days_including_travel > 0
  );

alter table public.training_requests
  drop constraint if exists training_requests_on_duty_within_total_check;

alter table public.training_requests
  add constraint training_requests_on_duty_within_total_check
  check (
    total_days_including_travel is null
    or number_of_days_on_duty <= total_days_including_travel
  );

alter table public.training_requests
  drop constraint if exists training_requests_on_duty_dates_length_check;

alter table public.training_requests
  add constraint training_requests_on_duty_dates_length_check
  check (
    total_days_including_travel is null
    or cardinality(on_duty_dates) = number_of_days_on_duty
  );

comment on column public.training_requests.total_days_including_travel is
  'Total course and travel days entered by the requester. Null on legacy rows until recaptured.';

comment on column public.training_requests.on_duty_dates is
  'Actual calendar dates on which training or travel falls on the requester regularly scheduled duty days.';

comment on column public.training_requests.number_of_days_on_duty is
  'Count of on-duty dates during training or travel. Separate from total_days_including_travel.';
