-- Disposable empty database only. Does not connect to the difm project.
\set ON_ERROR_STOP on
begin;
create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table public.services (
  id uuid primary key,
  kind text,
  unit_label text,
  minimum_units numeric,
  max_units numeric
);
create table public.bookings (
  id uuid primary key,
  service_id uuid references public.services(id),
  quantity numeric not null,
  pricing_snapshot jsonb
);
\ir ../supabase/migrations/20261125143000_booking_quantity_capacity.sql
create function public.expect_failure(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm not like '%capacity of % head%' then
      raise exception 'Unexpected failure for %: %', statement, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected rejection: %', statement;
end $$;

insert into public.services(id, kind, unit_label, minimum_units, max_units)
values
  ('00000000-0000-0000-0000-000000000001', 'grazing', 'head/week', 1, 2),
  ('00000000-0000-0000-0000-000000000002', 'grazing', 'ha', 1, 2),
  ('00000000-0000-0000-0000-000000000003', 'service', 'hour', 1, 2),
  ('00000000-0000-0000-0000-000000000004', 'grazing', 'head/month', 5, 2);

-- Capacity, including the advertised maximum, can be booked.
insert into public.bookings(id, service_id, quantity) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2);
-- A typed quantity above 2 head is rejected.
select public.expect_failure($$insert into public.bookings(id, service_id, quantity) values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 4)$$);
-- Hectares, other listing kinds, and a capacity below the minimum are not capped.
insert into public.bookings(id, service_id, quantity) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 4),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 5);
-- A saved rate option uses its own unit. Head still cannot exceed capacity.
select public.expect_failure($$insert into public.bookings(id, service_id, quantity, pricing_snapshot) values ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 4, '{"unit_label":"head/week","minimum_units":1}'::jsonb)$$);
insert into public.bookings(id, service_id, quantity, pricing_snapshot) values
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 4, '{"unit_label":"ha","minimum_units":1}'::jsonb);
-- Changing quantity on an existing booking is checked again. Status-only updates are not.
select public.expect_failure($$update public.bookings set quantity = 4 where id = '10000000-0000-0000-0000-000000000002'$$);
update public.bookings set pricing_snapshot = '{"unit_label":"head/week"}'::jsonb where id = '10000000-0000-0000-0000-000000000002';

do $$ begin
  if (select count(*) from public.bookings) <> 6 then
    raise exception 'Unexpected booking rows after capacity checks';
  end if;
  if (select quantity from public.bookings where id = '10000000-0000-0000-0000-000000000002') <> 2 then
    raise exception 'Maximum-capacity booking was changed';
  end if;
end $$;
rollback;
\echo 'Booking quantity capacity checks passed (rolled back).'
