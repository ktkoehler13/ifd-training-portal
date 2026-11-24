-- Office users receive the same administrative access as Admin (user request,
-- Nov 24): personnel management, all requests, approved training, System
-- Settings, request deletion/restoration and all compensation packets.
-- Office-stage action alerts and City Authorization routing are unchanged.

create or replace function public.is_personnel_administrator()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_personnel_role() in ('mto', 'deputy_chief', 'admin', 'office');
$$;

create or replace function public.is_personnel_routing_role()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_personnel_role() in ('mto', 'deputy_chief', 'admin', 'office');
$$;

create or replace function public.is_training_request_deletion_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.personnel where id=public.current_personnel_id() and active and role in ('admin','mto','deputy_chief','office'));
$$;

create or replace function public.can_read_training_compensation(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.training_compensation_packets c
    join public.training_requests r on r.id=c.request_id
    join public.personnel p on p.id=public.current_personnel_id() and p.active
    where c.request_id=p_request_id and r.deleted_at is null
      and (p.id=c.requester_id or p.role in ('mto','admin','deputy_chief','office'))
  );
$$;
