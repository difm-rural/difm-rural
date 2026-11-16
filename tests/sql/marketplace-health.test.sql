-- Run against a fresh, isolated PostgreSQL database only. The schema, roles
-- and fixtures below are transactional and never use remote connections.
\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz, email text);
create table public.profiles (id uuid primary key, is_admin boolean not null default false);
alter table public.profiles enable row level security;
grant insert on public.profiles to authenticated;
create policy test_own_profile on public.profiles for insert to authenticated
  with check (id = '00000000-0000-4000-8000-000000000091'::uuid);
create table public.jobs (
  id uuid primary key, status text, visibility text, created_at timestamptz,
  requester_id uuid, price_type text, schedule_type text, scheduled_date text,
  date_from date, date_to date, title text
);
create table public.bids (
  id uuid primary key default gen_random_uuid(), job_id uuid, status text,
  provider_id uuid, created_at timestamptz, payment_method text, message text
);
create table public.work_schedules (
  job_id uuid unique, requester_id uuid, provider_id uuid,
  arrival_start_at timestamptz, expected_complete_at timestamptz
);
create table public.job_status_history (
  id bigint generated always as identity primary key, job_id uuid,
  from_status text, to_status text, changed_at timestamptz
);
create table public.services (kind text, created_at timestamptz);
create table public.notifications (type text, metadata jsonb, created_at timestamptz, body text);
create function public.current_user_is_admin() returns boolean
language sql stable as $$select coalesce(current_setting('test.admin', true) = 'yes', false)$$;

\ir ../../supabase/migrations/20261116100000_marketplace_health.sql

create function pg_temp.assert_true(actual boolean, label text) returns void language plpgsql as $$
begin
  if actual is distinct from true then raise exception 'Failed: %', label; end if;
end;
$$;
create function pg_temp.job_id(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.snapshot() returns jsonb language sql as $$
  select marketplace_health_private.report('2026-11-16', '2026-11-15 18:00Z');
$$;
create function pg_temp.signals(n int) returns text[] language sql as $$
  select coalesce(array_agg(x->>'code' order by x->>'code'), '{}')
  from jsonb_array_elements(pg_temp.snapshot()->'exceptions') x
  where x->>'job_id' = pg_temp.job_id(n)::text;
$$;

select pg_temp.assert_true(marketplace_health_private.scheduled_day('2026-04-04 18:00Z') is null
  and marketplace_health_private.scheduled_day('2026-04-04 19:00Z') = date '2026-04-05', 'NZST dispatch');
select pg_temp.assert_true(marketplace_health_private.scheduled_day('2026-09-26 18:00Z') = date '2026-09-27'
  and marketplace_health_private.scheduled_day('2026-09-26 19:00Z') is null, 'NZDT dispatch');
select pg_temp.assert_true(marketplace_health_private.scheduled_day('2026-09-27 18:05Z') = date '2026-09-28',
  'Monday local date and retry window');
select pg_temp.assert_true(
  (marketplace_health_private.report('2026-04-06', now())->>'day_end')::timestamptz -
  (marketplace_health_private.report('2026-04-06', now())->>'day_start')::timestamptz = interval '25 hours',
  'fall-back calendar day');
select pg_temp.assert_true(
  (marketplace_health_private.report('2026-09-28', now())->>'day_end')::timestamptz -
  (marketplace_health_private.report('2026-09-28', now())->>'day_start')::timestamptz = interval '23 hours',
  'spring-forward calendar day');
select pg_temp.assert_true(pg_temp.snapshot()->'exceptions' = '[]'::jsonb
  and pg_temp.snapshot()->'activity'->>'registrations' = '0', 'successful empty report');

insert into public.jobs (id, status, visibility, created_at, requester_id, price_type, title)
select pg_temp.job_id(n), case when n between 5 and 15 then 'accepted' else 'open' end,
       case when n = 4 then 'invite_only' else 'public' end,
       case when n = 1 then '2026-11-13 18:00Z'::timestamptz
            when n = 22 then '2026-11-15 11:00Z'::timestamptz
            when n = 23 then '2026-11-14 11:00Z'::timestamptz else '2026-11-11 00:00Z'::timestamptz end,
       pg_temp.job_id(91), case when n in (9, 10, 14) then 'unpaid' else 'fixed' end,
       'PRIVATE_FIXTURE'
from generate_series(1, 23) n;
update public.jobs set status = 'completed' where id = pg_temp.job_id(20);
update public.jobs set status = 'cancelled' where id = pg_temp.job_id(21);
update public.jobs set schedule_type = 'specific', scheduled_date = '2026-11-16' where id = pg_temp.job_id(16);
update public.jobs set schedule_type = 'specific', scheduled_date = '2026-11-15' where id = pg_temp.job_id(17);
update public.jobs set schedule_type = 'range', date_from = '2026-11-10', date_to = '2026-11-14' where id = pg_temp.job_id(18);
update public.jobs set schedule_type = 'specific', scheduled_date = '2026-02-30' where id = pg_temp.job_id(19);
update public.jobs set schedule_type = 'specific', scheduled_date = '2026-11-17' where id = pg_temp.job_id(23);

insert into public.bids (job_id, status, provider_id, created_at, payment_method, message)
select pg_temp.job_id(n), 'accepted', pg_temp.job_id(92), '2026-11-12 00:00Z',
       case when n in (11, 12, 13, 15) then 'invoice' end, 'PRIVATE_FIXTURE'
from unnest(array[6,7,8,9,10,11,12,13,14,15,20]) n;
insert into public.bids (job_id, status, provider_id, created_at) values
  (pg_temp.job_id(6), 'accepted', pg_temp.job_id(93), '2026-11-12'),
  (pg_temp.job_id(3), 'pending', pg_temp.job_id(92), '2026-11-14 18:00Z'),
  (pg_temp.job_id(3), 'pending', pg_temp.job_id(93), '2026-11-14 17:59Z'),
  (pg_temp.job_id(3), 'pending', pg_temp.job_id(94), '2026-11-14 17:58Z'),
  (pg_temp.job_id(2), 'rejected', pg_temp.job_id(92), '2026-11-15 00:00Z'),
  (pg_temp.job_id(4), 'pending', pg_temp.job_id(92), '2026-11-15 00:00Z'),
  (pg_temp.job_id(22), 'accepted', pg_temp.job_id(92), '2026-11-15 11:00Z');

insert into public.job_status_history (job_id, from_status, to_status, changed_at)
select pg_temp.job_id(n), 'open', 'accepted',
       case when n = 8 then '2026-11-14 18:00Z'::timestamptz else '2026-11-13 08:00Z'::timestamptz end
from generate_series(8, 15) n;
insert into public.job_status_history (job_id, from_status, to_status, changed_at) values
  (pg_temp.job_id(7), null, 'accepted', '2026-11-13 08:00Z'),
  (pg_temp.job_id(20), 'open', 'accepted', '2026-11-15 00:00Z'),
  (pg_temp.job_id(20), 'accepted', 'completed', '2026-11-15 08:00Z'),
  (pg_temp.job_id(21), 'open', 'accepted', '2026-11-15 01:00Z'),
  (pg_temp.job_id(21), 'accepted', 'open', '2026-11-15 01:01Z');
insert into public.work_schedules values
  (pg_temp.job_id(9), pg_temp.job_id(91), pg_temp.job_id(92), '2026-11-17 06:00Z', '2026-11-17 08:00Z'),
  (pg_temp.job_id(10), pg_temp.job_id(91), pg_temp.job_id(92), '2026-11-14 10:00Z', '2026-11-14 17:59Z'),
  (pg_temp.job_id(11), pg_temp.job_id(91), pg_temp.job_id(92), '2026-11-14 10:00Z', '2026-11-14 18:00Z'),
  (pg_temp.job_id(12), pg_temp.job_id(91), pg_temp.job_id(92), '2026-11-14 10:00Z', '2026-11-14 17:59Z'),
  (pg_temp.job_id(13), pg_temp.job_id(91), pg_temp.job_id(93), '2026-11-14 10:00Z', '2026-11-14 17:59Z'),
  (pg_temp.job_id(15), pg_temp.job_id(91), pg_temp.job_id(92), '2026-11-14 10:00Z', null);

insert into auth.users values
  (pg_temp.job_id(91), '2026-11-14 11:00Z', 'PRIVATE_FIXTURE'),
  (pg_temp.job_id(92), '2026-11-15 11:00Z', 'PRIVATE_FIXTURE');
insert into public.services values ('grazing', '2026-11-14 12:00Z'), ('hire', '2026-11-15 00:00Z');
insert into public.notifications values
  ('bid_accepted', jsonb_build_object('job_id', pg_temp.job_id(20)), '2026-11-15 00:00Z', 'PRIVATE_FIXTURE'),
  ('bid_accepted', jsonb_build_object('job_id', pg_temp.job_id(4)), '2026-11-15 00:00Z', 'PRIVATE_FIXTURE'),
  ('bid_accepted', '{"job_id":"malformed"}', '2026-11-15 00:00Z', 'PRIVATE_FIXTURE');

select pg_temp.assert_true(pg_temp.signals(1) = '{}'::text[] and pg_temp.signals(2) = '{no_active_offers}',
  '48h strict boundary, rejected offers inactive');
select pg_temp.assert_true(pg_temp.signals(3) = '{offer_awaiting_decision}' and exists (
  select from jsonb_array_elements(pg_temp.snapshot()->'exceptions') e
  where e->>'job_id' = pg_temp.job_id(3)::text and e->>'stale_offer_count' = '2'
), '24h strict offer boundary and counts grouped by job');
select pg_temp.assert_true(pg_temp.signals(4) = '{}'::text[], 'invite-only excluded');
select pg_temp.assert_true(pg_temp.signals(5) = '{data_quality}' and pg_temp.signals(6) = '{data_quality}'
  and pg_temp.signals(7) = '{data_quality}' and pg_temp.signals(22) = '{data_quality}',
  'missing winners, duplicate winners, seeded history and open with winner');
select pg_temp.assert_true(pg_temp.signals(8) = '{waiting_to_confirm}' and pg_temp.signals(14) = '{waiting_to_confirm}',
  '24h inclusive award boundary, unpaid still needs arrival');
select pg_temp.assert_true(pg_temp.signals(9) = '{}'::text[] and pg_temp.signals(10) = '{overdue_completion}'
  and pg_temp.signals(11) = '{}'::text[] and pg_temp.signals(12) = '{overdue_completion}'
  and pg_temp.signals(13) = '{data_quality}' and pg_temp.signals(15) = '{data_quality}',
  'unpaid with arrival, finish boundary, mismatched provider, missing finish');
select pg_temp.assert_true(pg_temp.signals(16) = '{no_active_offers}'
  and pg_temp.signals(17) = '{expired_requested_date,no_active_offers}'
  and pg_temp.signals(18) = '{expired_requested_date,no_active_offers}'
  and pg_temp.signals(19) = '{no_active_offers}' and pg_temp.signals(23) = '{}'::text[],
  'current day, future day, expired specific/range and malformed date');
select pg_temp.assert_true(pg_temp.signals(20) = '{}'::text[] and pg_temp.signals(21) = '{}'::text[],
  'completed and cancelled jobs excluded from exception queue');
select pg_temp.assert_true(pg_temp.snapshot()->'activity' = '{
  "registrations":1,"public_jobs":1,"listings":{"grazing":1,"hire":1},"offers_submitted":4,
  "offers_accepted":null,"jobs_awarded":2,"jobs_completed":1
}'::jsonb, 'source-specific activity windows, rollback and visibility');
update public.notifications set type = 'bid_accepted', created_at = '2026-11-15 01:00Z';
select pg_temp.assert_true(pg_temp.snapshot()->'activity'->'offers_accepted' = 'null'::jsonb,
  'editable notifications cannot produce an accepted offer count');
select pg_temp.assert_true(pg_temp.snapshot()::text not like '%PRIVATE_FIXTURE%', 'no free text, account or private message data');

update public.bids set status = 'rejected' where job_id = pg_temp.job_id(3);
select pg_temp.assert_true(pg_temp.signals(3) = '{no_active_offers}', 'rejection replaces the pending decision signal');
update public.jobs set status = 'accepted' where id = pg_temp.job_id(3);
select pg_temp.assert_true(pg_temp.signals(3) = '{data_quality}', 'a partial award cannot become a confirmation follow-up');
update public.bids set status = 'accepted'
where job_id = pg_temp.job_id(3) and provider_id = pg_temp.job_id(93);
insert into public.job_status_history (job_id, from_status, to_status, changed_at)
values (pg_temp.job_id(3), 'open', 'accepted', '2026-11-14 18:00:01Z');
select pg_temp.assert_true(pg_temp.signals(3) = '{}'::text[], 'award one second short of confirmation threshold');
update public.jobs set status = 'completed' where id = pg_temp.job_id(10);
select pg_temp.assert_true(pg_temp.signals(10) = '{}'::text[], 'completion clears the overdue signal');

select pg_temp.assert_true(not has_schema_privilege('authenticated','marketplace_health_private','USAGE')
  and not has_schema_privilege('service_role','marketplace_health_private','USAGE')
  and not has_function_privilege('anon','public.marketplace_health_history(date,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.marketplace_health_claim(text)','EXECUTE')
  and not has_function_privilege('authenticated','public.marketplace_health_finish(date,text,uuid)','EXECUTE'),
  'schema and RPC grants');
set local role authenticated;
do $$
begin
  insert into public.profiles (id, is_admin) values (pg_temp.job_id(91), true);
  raise exception 'Missing-profile account could self-promote';
exception when insufficient_privilege then null;
end $$;
insert into public.profiles (id) values (pg_temp.job_id(91));
do $$
begin
  perform public.marketplace_health_history();
  raise exception 'Non-admin history was exposed';
exception when insufficient_privilege then null;
end $$;
set local test.admin = 'yes';
select pg_temp.assert_true(public.marketplace_health_history()->'report' = 'null', 'missing report is unavailable');
reset role;

set local role service_role;
select public.marketplace_health_claim('manual') as first_claim \gset
select pg_temp.assert_true(public.marketplace_health_claim('manual')->>'status' = 'in_progress', 'running claim is exclusive');
reset role;
alter table auth.users rename to unavailable_users;
set local role service_role;
select pg_temp.assert_true(public.marketplace_health_finish(
  (:'first_claim'::jsonb->>'run_date')::date, 'manual', (:'first_claim'::jsonb->>'claim_id')::uuid
) = 'failed', 'source failure does not produce an empty report');
reset role;
set local role authenticated;
select pg_temp.assert_true(public.marketplace_health_history(null, 'manual')->'report' = 'null'
  and public.marketplace_health_history()->'history'->0->>'status' = 'failed', 'failed run visible');
reset role;
alter table auth.unavailable_users rename to users;
set local role service_role;
select public.marketplace_health_claim('manual') as second_claim \gset
reset role;
update marketplace_health_private.runs set started_at = now() - interval '6 minutes' where source = 'manual';
set local role service_role;
select public.marketplace_health_claim('manual') as third_claim \gset
select pg_temp.assert_true(public.marketplace_health_finish(
  (:'second_claim'::jsonb->>'run_date')::date, 'manual', (:'second_claim'::jsonb->>'claim_id')::uuid
) = 'claim_lost', 'expired owner cannot overwrite a retry');
select pg_temp.assert_true(public.marketplace_health_finish(
  (:'third_claim'::jsonb->>'run_date')::date, 'manual', (:'third_claim'::jsonb->>'claim_id')::uuid
) = 'succeeded', 'retry stores successful report');
select pg_temp.assert_true(public.marketplace_health_claim('manual')->>'status' = 'already_succeeded', 'idempotency');
reset role;
set local role authenticated;
select pg_temp.assert_true(public.marketplace_health_history(null, 'manual')->'report'->'exceptions' is not null
  and public.marketplace_health_history()->'history'->0->>'attempts' = '3'
  and public.marketplace_health_history()->'history'->0->>'claim_id' is null,
  'admin history exposes status and counts without claim credentials');
reset role;

insert into marketplace_health_private.runs (run_date, source, status, attempts, started_at, claim_id)
values ((now() at time zone 'Pacific/Auckland')::date, 'scheduled', 'running', 1, now(), pg_temp.job_id(99));
set local role service_role;
select pg_temp.assert_true(public.marketplace_health_finish(
  (:'third_claim'::jsonb->>'run_date')::date, 'scheduled', (:'third_claim'::jsonb->>'claim_id')::uuid
) = 'claim_lost', 'manual claim cannot finish the scheduled slot');
select pg_temp.assert_true(public.marketplace_health_finish(
  (:'third_claim'::jsonb->>'run_date')::date, 'scheduled', pg_temp.job_id(99)
) = 'succeeded', 'scheduled slot completes independently of manual success');
reset role;

-- Projected local workload. Record measurements without a host-dependent
-- timing assertion. The exact row count verifies no results are truncated.
insert into public.jobs (id, status, visibility, created_at, requester_id, price_type, schedule_type, scheduled_date)
select pg_temp.job_id(n), 'open', 'public', '2026-11-11 00:00Z', pg_temp.job_id(91), 'fixed', 'specific', '2026-11-14'
from generate_series(1000, 2299) n;
do $$
declare
  t timestamptz := clock_timestamp();
  result jsonb := pg_temp.snapshot();
  projected_count integer;
begin
  select count(*) into projected_count from jsonb_array_elements(result->'exceptions') as e
    where e->>'code' = 'expired_requested_date' or e->>'code' = 'no_active_offers';
  perform pg_temp.assert_true(projected_count >= 2600, 'projected report retains all seeded signals');
  raise notice 'Projected SQL report: % signals, % JSON bytes, % milliseconds',
    jsonb_array_length(result->'exceptions'), octet_length(result::text),
    round(extract(epoch from clock_timestamp() - t) * 1000, 1);
end $$;
rollback;
\echo Marketplace Health SQL tests passed
