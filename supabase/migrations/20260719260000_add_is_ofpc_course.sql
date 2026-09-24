alter table public.training_requests
  add column if not exists is_ofpc_course boolean;

comment on column public.training_requests.is_ofpc_course is
  'Whether the course is offered through OFPC. Null on legacy rows until edited.';
