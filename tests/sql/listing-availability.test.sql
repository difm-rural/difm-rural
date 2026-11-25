\set ON_ERROR_STOP on
-- Run in an empty, disposable local PostgreSQL database.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
grant usage on schema auth to public;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function public.current_user_is_admin() returns boolean language sql stable as $$ select false $$;
create function public.is_assistant_token() returns boolean language sql stable as $$
  select coalesce(current_setting('test.assistant', true), '') = 'yes'
$$;
create function public.locality_from_address(value text) returns text language sql immutable as $$
  select 'Testtown'::text
$$;
create table public.services (
  id uuid primary key, provider_id uuid not null, title text, is_active boolean,
  closed_at timestamptz, location_name text, latitude numeric, longitude numeric,
  service_latitude numeric, service_longitude numeric, location_note text,
  availability text[], pricing_type text
);
create table public.bookings (
  id uuid primary key, service_id uuid references public.services(id),
  requester_id uuid, provider_id uuid, status text
);
alter table public.services enable row level security;
alter table public.bookings enable row level security;
create policy public_listings on public.services for select using(is_active);
create policy owner_listings on public.services for all to authenticated
  using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy assistant_listing_guard on public.services as restrictive for update to public
  using(not public.is_assistant_token()) with check(not public.is_assistant_token());
create policy booking_insert on public.bookings for insert to authenticated with check(requester_id=auth.uid());
create policy booking_read on public.bookings for select to authenticated using(auth.uid() in (requester_id,provider_id));
create policy booking_update on public.bookings for update to authenticated using(auth.uid() in (requester_id,provider_id));
grant select on public.services to anon, authenticated;
grant update on public.services to authenticated;
grant select, insert, update on public.bookings to authenticated;

insert into public.services (id,provider_id,title,is_active,location_name,latitude,longitude,
    service_latitude,service_longitude,location_note,availability,pricing_type) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
   'Availability test listing',true,'123 Private Road, Testtown, New Zealand',-41.12345,174.12345,
   -41.12345,174.12345,'Private gate note',array['2027-01-02'],'fixed'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
   'Quote test listing',true,'Testtown',null,null,null,null,null,null,'quote_required');
insert into public.bookings values ('20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001','pending');

\ir ../../supabase/migrations/20261124120000_listing_location_privacy.sql
\ir ../../supabase/migrations/20261126120000_listing_availability.sql

begin;
set local role anon;
do $$ begin
  if not exists(select 1 from services_public where title='Availability test listing'
    and availability_status='accepting_bookings' and availability_updated_at is null
    and availability=array['2027-01-02']) then raise exception 'legacy defaults changed'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  update services set availability_status='paused';
  if found then raise exception 'non-owner changed availability'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local test.assistant = 'yes';
do $$ begin
  update services set availability_status='paused';
  if found then raise exception 'assistant changed availability'; end if;
end $$;
set local test.assistant = 'no';

update services set availability_status='limited', lead_time_type='same_day';
update services set lead_time_type='next_day';
update services set lead_time_type='fixed_days', lead_time_min_days=2;
update services set lead_time_type='range_days', lead_time_max_days=4;
update services set lead_time_type='earliest_date', lead_time_min_days=null, lead_time_max_days=null,
  lead_time_date=(now() at time zone 'Pacific/Auckland')::date + 1;
update services set lead_time_type='contact_provider', lead_time_date=null;
update services set lead_time_type='not_specified';

do $$ begin
  begin
    update services set availability_message=repeat('x',251);
    raise exception 'message limit not enforced';
  exception when check_violation then null; end;
  begin
    update services set lead_time_type='range_days', lead_time_min_days=5, lead_time_max_days=2;
    raise exception 'reversed range accepted';
  exception when check_violation then null; end;
  begin
    update services set lead_time_type='earliest_date', lead_time_date='2000-01-01';
    raise exception 'past date accepted';
  exception when invalid_datetime_format then null; end;
end $$;
update services set availability_status='paused', lead_time_type='range_days',
  lead_time_min_days=2, lead_time_max_days=4, availability_message='  High demand  ';
update services set title=title;
update services set availability_updated_at='2000-01-01';
-- Existing requests remain actionable after the availability update.
update bookings set status='confirmed' where status='pending';
reset role;

set local role anon;
do $$ begin
  if (select count(*) from services_public where is_active and closed_at is null and availability_status='paused'
    and lead_time_min_days=2 and lead_time_max_days=4 and availability_message='High demand'
    and availability_updated_at > '2000-01-01') <> 2 then raise exception 'paused listings or settings are missing'; end if;
  if exists(select 1 from services_public where latitude is not null or longitude is not null
    or service_latitude is not null or service_longitude is not null or location_note is not null)
    then raise exception 'private location exposed'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ declare listing record; begin
  for listing in select id, provider_id from services_public loop
    begin
      insert into bookings values(gen_random_uuid(), listing.id, auth.uid(), listing.provider_id, 'pending');
      raise exception 'new request was accepted';
    exception when sqlstate 'P0A01' then null;
    end;
  end loop;
end $$;
insert into bookings values ('20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',auth.uid(),
  '00000000-0000-4000-8000-000000000001','pending') on conflict(id) do nothing;
do $$ begin
  if (select count(*) from bookings where status='confirmed') <> 1 then raise exception 'retry changed the booking'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
update services set availability_status='accepting_bookings';
do $$ begin
  if (select count(*) from services where lead_time_min_days=2 and lead_time_max_days=4) <> 2
    then raise exception 'reopen discarded lead time'; end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into bookings values(gen_random_uuid(),'10000000-0000-4000-8000-000000000002',
  auth.uid(),'00000000-0000-4000-8000-000000000001','pending');
rollback;
select 'PASS listing availability, legacy rows, owner/RLS, privacy, paused bookings and quotes, retries, and reopen';
