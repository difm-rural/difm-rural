-- Disposable empty database only. Applies the already-shipped capacity
-- trigger, then the unapplied whole-head replacement. Does not connect to difm.
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
\ir ../supabase/migrations/20261125170000_booking_quantity_whole_head.sql
create function public.expect_failure(statement text, fragment text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm not like '%' || fragment || '%' then
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
  ('00000000-0000-0000-0000-000000000003', 'grazing', 'head/month', 1, null);

insert into public.bookings(id, service_id, quantity) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2.0),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 1.5);
select public.expect_failure($$insert into public.bookings(id, service_id, quantity) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 1.5)$$, 'whole number of head');
select public.expect_failure($$insert into public.bookings(id, service_id, quantity) values ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 0.5)$$, 'whole number of head');
select public.expect_failure($$insert into public.bookings(id, service_id, quantity) values ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 4)$$, 'capacity of 2 head');
select public.expect_failure($$insert into public.bookings(id, service_id, quantity) values ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 1.5)$$, 'whole number of head');
insert into public.bookings(id, service_id, quantity) values
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', 10);
select public.expect_failure($$update public.bookings set quantity = 1.5 where id = '10000000-0000-0000-0000-000000000001'$$, 'whole number of head');
update public.bookings set pricing_snapshot = '{"unit_label":"head/week"}'::jsonb where id = '10000000-0000-0000-0000-000000000001';

do $$ begin
  if (select count(*) from public.bookings) <> 4 then
    raise exception 'Unexpected booking rows after whole-head checks';
  end if;
  if (select quantity from public.bookings where id = '10000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Whole-head booking was changed';
  end if;
end $$;
rollback;
\echo 'Booking whole-head checks passed (rolled back).'
