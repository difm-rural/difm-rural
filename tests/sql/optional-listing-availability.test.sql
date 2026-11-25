\set ON_ERROR_STOP on
-- Start in an empty, disposable local PostgreSQL database.
\ir listing-availability.test.sql

update public.services set availability_status='paused', lead_time_type='range_days',
  lead_time_min_days=4, lead_time_max_days=5, availability_message='Call about access.'
  where pricing_type='fixed';
\ir ../../supabase/migrations/20261126130000_optional_listing_availability.sql

begin;
do $$ begin
  if (select count(*) from services where pricing_type='fixed' and availability_enabled
    and availability_status='paused' and availability_updated_at is not null) <> 1 then
    raise exception 'configured listing not preserved';
  end if;
  if exists(select 1 from services where pricing_type='quote_required' and availability_enabled) then
    raise exception 'unconfigured listing was enabled';
  end if;
end $$;

insert into services(id,provider_id,title,is_active) values
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Old client create',true);
insert into services(id,provider_id,title,is_active,availability_enabled) values
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Opted-in create',true,true);
do $$ begin
  if not exists(select 1 from services where title='Old client create' and not availability_enabled
    and availability_updated_at is null) then raise exception 'old create changed'; end if;
  if not exists(select 1 from services where title='Opted-in create' and availability_enabled
    and availability_updated_at is not null) then raise exception 'new opt-in not stamped'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
update services set availability_enabled=true, availability_status='paused',
  lead_time_type='range_days', lead_time_min_days=4, lead_time_max_days=5
  where pricing_type='quote_required';
-- Publication and already-created requests are independent of the flag.
update bookings set status='confirmed' where status='pending';
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ declare listing record; begin
  update services set availability_enabled=false where availability_enabled;
  if found then raise exception 'non-owner disabled availability'; end if;
  for listing in select id, provider_id from services_public where pricing_type in ('fixed','quote_required') loop
    begin
      insert into bookings values(gen_random_uuid(),listing.id,auth.uid(),listing.provider_id,'pending');
      raise exception 'enabled pause did not block request';
    exception when sqlstate 'P0A01' then null;
    end;
  end loop;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
update services set availability_enabled=false where pricing_type in ('fixed','quote_required');
do $$ begin
  if (select count(*) from services where pricing_type in ('fixed','quote_required')
    and not availability_enabled and availability_status='paused' and lead_time_min_days=4 and lead_time_max_days=5
    and is_active and closed_at is null) <> 2 then raise exception 'disable discarded settings or publication'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if (select count(*) from services_public where pricing_type in ('fixed','quote_required')
    and not availability_enabled and availability_status='accepting_bookings' and lead_time_type='not_specified'
    and availability_updated_at is null and availability_message is null and lead_time_min_days is null
    and is_active and closed_at is null and latitude is null and longitude is null) <> 2 then
    raise exception 'disabled public or old-client view is incorrect';
  end if;
  if not exists(select 1 from services_public where pricing_type='fixed' and availability=array['2027-01-02']) then
    raise exception 'legacy available-from date was lost';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into bookings
  select gen_random_uuid(),id,auth.uid(),provider_id,'pending'
  from services_public where pricing_type in ('fixed','quote_required');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
-- Old clients can still save ordinary listing edits without reactivating availability.
update services set title=title where pricing_type='fixed';
update services set lead_time_max_days=5 where pricing_type='fixed';
do $$ begin
  if exists(select 1 from services where pricing_type='fixed' and availability_enabled) then
    raise exception 'older editor silently enabled availability';
  end if;
end $$;
update services set availability_enabled=true where pricing_type in ('fixed','quote_required');
do $$ begin
  if (select count(*) from services_public where pricing_type in ('fixed','quote_required')
    and availability_enabled and availability_status='paused' and lead_time_min_days=4 and lead_time_max_days=5) <> 2 then
    raise exception 're-enabling did not restore prior settings';
  end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into bookings values ('20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',auth.uid(),
  '00000000-0000-4000-8000-000000000001','pending') on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from bookings where id='20000000-0000-4000-8000-000000000001' and status='confirmed') then
    raise exception 'existing booking or retry changed';
  end if;
  begin
    insert into bookings values (gen_random_uuid(),'10000000-0000-4000-8000-000000000001',auth.uid(),
      '00000000-0000-4000-8000-000000000001','pending');
    raise exception 're-enabled pause did not block a new request';
  exception when sqlstate 'P0A01' then null;
  end;
end $$;
rollback;
select 'PASS optional listing availability: backfill, opt-in, permissions, opt-out, reopening, legacy reads and re-enable' as result;
