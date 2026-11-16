-- Run as the postgres database owner with CREATEROLE in a disposable cluster.
-- The Cron shim captures the registration only. psql executes its exact
-- command through the simple-query protocol used by local-connection pg_cron.
\set ON_ERROR_STOP on
\ir marketplace-health-fixture.sql

-- The minimal report fixture has no marketplace triggers. Model the reviewed
-- hosted ACLs here; the full schema replay checks the real implementations.
create function public.can_see_job_location(uuid) returns boolean language sql security definer as 'select false';
create function public.is_accepted_provider(uuid) returns boolean language sql security definer as 'select false';
create function public.is_invited_to_job(uuid) returns boolean language sql security definer as 'select false';
create function public.job_owner_id(uuid) returns uuid language sql security definer as 'select null::uuid';
alter function public.current_user_is_admin() security definer;
do $$
declare
  function_name text;
  routine regprocedure;
begin
  foreach function_name in array array[
    'capture_booking_status_history', 'capture_job_status_history',
    'enqueue_notification_email', 'handle_new_user', 'notify_bid_placed',
    'notify_bid_status_change', 'notify_booking_created', 'notify_booking_status_change',
    'notify_job_invite', 'notify_job_status_change', 'notify_new_booking_message',
    'notify_new_message', 'notify_new_question', 'notify_question_answered',
    'notify_review_created', 'notify_send_push', 'on_job_refresh_opportunities',
    'on_job_refresh_saved_interests', 'on_opportunity_preferences_refresh',
    'on_provider_availability_refresh', 'on_provider_refresh_opportunities',
    'protect_bid_integrity', 'protect_profile_privileged_cols'
  ] loop
    execute format(
      'create function public.%I() returns trigger language plpgsql security definer as %L',
      function_name, 'begin return new; end;'
    );
  end loop;
  for routine in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname not like 'marketplace_health_%'
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', routine);
  end loop;
end;
$$;

-- An unexpected overload must abort the entire release, including the role
-- creation and all earlier ACL changes.
create function public.job_owner_id(text) returns uuid language sql security definer as 'select null::uuid';
\set ON_ERROR_STOP off
\ir ../../supabase/migrations/20261116110000_marketplace_health_sql_schedule.sql
\set ON_ERROR_STOP on
select pg_temp.assert_true(
  not exists(select from pg_roles where rolname = 'marketplace_health_cron')
  and to_regprocedure('marketplace_health_private.dispatch()') is not null
  and exists(
    select from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid = 'public.job_owner_id(uuid)'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ), 'unexpected overload rolls back role creation, dispatcher removal and the ACL change');
drop function public.job_owner_id(text);
\ir ../../supabase/migrations/20261116110000_marketplace_health_sql_schedule.sql

select pg_temp.assert_true(
  (select count(*) = 28 from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and p.proname not like 'marketplace_health_%'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and has_function_privilege('service_role', p.oid, 'EXECUTE')
     and has_function_privilege('postgres', p.oid, 'EXECUTE')
     and not has_function_privilege('marketplace_health_cron', p.oid, 'EXECUTE')),
  'named marketplace grants survive while the worker loses PUBLIC access');

select pg_temp.assert_true(
  marketplace_health_private.scheduled_day('2026-04-03 18:00Z') = date '2026-04-04'
  and marketplace_health_private.scheduled_day('2026-04-04 19:00Z') = date '2026-04-05'
  and marketplace_health_private.scheduled_day('2026-09-25 19:00Z') = date '2026-09-26'
  and marketplace_health_private.scheduled_day('2026-09-26 18:00Z') = date '2026-09-27'
  and marketplace_health_private.scheduled_day('2026-04-04 18:00Z') is null
  and marketplace_health_private.scheduled_day('2026-09-26 19:00Z') is null,
  'the 07:00 gate follows both DST transitions');

select pg_temp.assert_true(
  not has_schema_privilege('authenticated', 'marketplace_health_private', 'USAGE')
  and not has_function_privilege('anon', 'marketplace_health_private.claim_scheduled()', 'EXECUTE')
  and not has_function_privilege('service_role', 'marketplace_health_private.finish_scheduled()', 'EXECUTE')
  and not has_table_privilege('marketplace_health_cron', 'marketplace_health_private.runs', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_function_privilege('marketplace_health_cron', 'marketplace_health_private.report(date,timestamptz)', 'EXECUTE')
  and not has_function_privilege('marketplace_health_cron', 'public.marketplace_health_claim(text)', 'EXECUTE')
  and not (select rolcanlogin from pg_roles where rolname = 'marketplace_health_cron'),
  'worker can invoke only its two reporting entry points and cannot log in');

create schema cron;
create table cron.job (jobid bigint, jobname text, schedule text, command text, username text);
create function cron.schedule(text, text, text) returns bigint language sql as $$
  insert into cron.job values (1, $1, $2, $3, current_user) returning jobid;
$$;
create function cron.unschedule(bigint) returns boolean language sql as $$
  with removed as (delete from cron.job where jobid = $1 returning jobid)
  select exists(select 1 from removed);
$$;
set cron.use_background_workers = 'off';
set cron.timezone = 'GMT';
select set_config('cron.database_name', current_database(), false);
\ir ../../supabase/snippets/enable_marketplace_health_schedule.sql
select pg_temp.assert_true(
  (select schedule = '*/5 18,19,20 * * *' and username = 'postgres' from cron.job),
  'registration uses UTC candidate hours and the approved connection identity');

-- Keep the real claim, lease and report clock. Force only the local-hour gate
-- after checking DST above so the workflow can be tested at any time of day.
create or replace function marketplace_health_private.scheduled_day(p_now timestamptz)
returns date language sql stable set search_path = '' as $$
  select (p_now at time zone 'Pacific/Auckland')::date;
$$;

select public.marketplace_health_claim('manual') as manual_claim \gset
select pg_temp.assert_true(
  public.marketplace_health_finish((:'manual_claim'::jsonb->>'run_date')::date,
    'manual', (:'manual_claim'::jsonb->>'claim_id')::uuid) = 'succeeded', 'manual baseline');

alter table auth.users rename to unavailable_users;
select command from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'failed' and attempts = 1 and report is null and finished_at is not null
   from marketplace_health_private.runs where source = 'scheduled'),
  'missing source records failure and preserves the attempt');
alter table auth.unavailable_users rename to users;

alter function marketplace_health_private.report(date, timestamptz) rename to real_report;
create function marketplace_health_private.report(date, timestamptz)
returns jsonb language plpgsql as $$
begin
  perform pg_sleep(30);
  return marketplace_health_private.real_report($1, $2);
end;
$$;
revoke execute on function marketplace_health_private.report(date, timestamptz) from public;
select replace(command, '20s', '200ms') from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'failed' and attempts = 2 and report is null
   and finished_at - started_at < interval '5 seconds'
   from marketplace_health_private.runs where source = 'scheduled'),
  'real statement_timeout preserves and records the second failed attempt');
drop function marketplace_health_private.report(date, timestamptz);
alter function marketplace_health_private.real_report(date, timestamptz) rename to report;

select command from cron.job \gexec
select command from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'succeeded' and attempts = 3 and report->'exceptions' = '[]'::jsonb
   from marketplace_health_private.runs where source = 'scheduled')
  and (select status = 'succeeded' and attempts = 1
   from marketplace_health_private.runs where source = 'manual'),
  'retry succeeds, duplicate does not rerun, the empty dataset is a valid report and manual is untouched');

set role authenticated;
set test.admin = 'yes';
select pg_temp.assert_true(
  public.marketplace_health_history()->'report'->>'activity_date' =
    ((statement_timestamp() at time zone 'Pacific/Auckland')::date - 1)::text
  and jsonb_array_length(public.marketplace_health_history()->'history') = 2,
  'admin page RPC selects today’s scheduled report and lists both slots');
reset test.admin;
do $$
begin
  perform public.marketplace_health_history();
  raise exception 'Scheduled history was exposed to a non-admin';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Simulate a lost connection between the two commits, then a duplicate
-- connection during the lease. Each claim transaction uses a fresh GUC.
delete from marketplace_health_private.runs where source = 'scheduled';
select split_part(command, 'commit;', 1) || 'commit;' from cron.job \gexec
reset marketplace_health.scheduled_claim;
select command from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'running' and attempts = 1 from marketplace_health_private.runs where source = 'scheduled'),
  'a second invocation cannot steal a live committed claim');
update marketplace_health_private.runs set started_at = clock_timestamp() - interval '6 minutes'
where source = 'scheduled';
select command from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'succeeded' and attempts = 2 from marketplace_health_private.runs where source = 'scheduled'),
  'an interrupted attempt is reclaimed after its lease');
update marketplace_health_private.runs
set attempts = 3, started_at = clock_timestamp() - interval '6 minutes',
    status = 'running', report = null, finished_at = null
where source = 'scheduled';
reset marketplace_health.scheduled_claim;
select command from cron.job \gexec
select pg_temp.assert_true(
  (select status = 'failed' and attempts = 3 and finished_at is not null
   from marketplace_health_private.runs where source = 'scheduled'),
  'an interrupted final attempt is retired and a fourth run is blocked');

\ir ../../supabase/snippets/disable_marketplace_health_schedule.sql
\ir ../../supabase/snippets/disable_marketplace_health_schedule.sql
select pg_temp.assert_true(not exists(select 1 from cron.job), 'emergency stop is idempotent');
\echo Marketplace Health scheduler SQL tests passed
