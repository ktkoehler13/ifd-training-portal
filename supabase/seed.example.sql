-- Development-only seed examples for the IFD Training Portal personnel table.
-- Run manually in the Supabase SQL editor after applying the migration.
-- Do not use real personnel information in this repository or in shared environments.

-- Example firefighter
-- insert into public.personnel (badge_number, email, role, active)
-- values ('FF-1001', 'firefighter.example@ifd-prototype.local', 'firefighter', true);

-- Example MTO
-- insert into public.personnel (badge_number, email, role, active)
-- values ('MTO-2001', 'mto.example@ifd-prototype.local', 'mto', true);

-- Example Deputy Chief
-- insert into public.personnel (badge_number, email, role, active)
-- values ('DC-3001', 'deputy-chief.example@ifd-prototype.local', 'deputy_chief', true);

-- Optional initial admin for future Microsoft 365 authentication testing
-- insert into public.personnel (badge_number, email, role, active)
-- values ('ADM-9001', 'admin.example@ifd-prototype.local', 'admin', true);

-- Verify seeded rows
-- select badge_number, email, role, active, created_at
-- from public.personnel
-- order by created_at desc;
