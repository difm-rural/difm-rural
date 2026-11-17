-- Run only on the same disposable, loopback PostgreSQL cluster as the SQL
-- matrix. Separate connections require committed fixture rows.
\set ON_ERROR_STOP on
do $$
begin
  if inet_server_addr() is distinct from inet '127.0.0.1' or current_user <> 'postgres' then
    raise exception 'Payment concurrency test requires the postgres role on a disposable loopback cluster';
  end if;
end;
$$;
set row_security = on;
set search_path = public, pg_catalog;
create extension if not exists dblink;
\ir payment-acknowledgement-fixture.sql
update public.jobs set status='completed' where id='20000000-0000-4000-8000-000000000011';

create function pg_temp.assert_payment(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Payment concurrency: %', label; end if;
end;
$$;

select dblink_connect(name,format('host=127.0.0.1 port=%s user=postgres dbname=%s',inet_server_port(),current_database()))
from unnest(array['requester','provider']) name;
select pid as requester_pid from dblink('requester','select pg_backend_pid()') as t(pid int) \gset
select pid as provider_pid from dblink('provider','select pg_backend_pid()') as t(pid int) \gset

create function pg_temp.wait_for_blocker(waiting_pid int, blocker_pid int) returns void language plpgsql as $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  while not (blocker_pid = any(pg_blocking_pids(waiting_pid))) loop
    if clock_timestamp() >= deadline then
      raise exception 'Expected concurrent payment call to be blocked';
    end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

select dblink_exec('requester','begin');
select dblink_exec('requester','set local role authenticated');
select dblink_exec('requester',$$set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001'$$);
select dblink_exec('requester',$rpc$
  do $$begin perform public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021'); end$$
$rpc$);
select dblink_exec('provider','set role authenticated');
select dblink_exec('provider',$$set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'$$);
select pg_temp.assert_payment(dblink_send_query('provider',$$
  select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021')::text
$$)=1,'provider submitted a simultaneous acknowledgement');
select pg_temp.wait_for_blocker(:provider_pid,:requester_pid);
select dblink_exec('requester','commit');
select * from dblink_get_result('provider') as t(result text);
select * from dblink_get_result('provider') as t(result text);

select pg_temp.assert_payment(
 (select payment_sorted_by='20000000-0000-4000-8000-000000000001' and payment_sorted_at is not null
  from public.bids where id='20000000-0000-4000-8000-000000000021')
 and (select count(*)=1 from public.notifications
      where type='payment_sorted' and metadata->>'bid_id'='20000000-0000-4000-8000-000000000021')
 and (select count(*)=1 from public.messages where job_id='20000000-0000-4000-8000-000000000011'),
 'the second acknowledgement was a no-op after the first committed');

select dblink_exec('requester','begin');
select dblink_exec('requester',$$
  update public.jobs set status='cancelled' where id = '20000000-0000-4000-8000-000000000010'
$$);
select pg_temp.assert_payment(dblink_send_query('provider',$$
  select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020')::text
$$)=1,'acknowledgement was submitted during cancellation');
select pg_temp.wait_for_blocker(:provider_pid,:requester_pid);
select dblink_exec('requester','commit');
select * from dblink_get_result('provider',false) as t(result text);
select pg_temp.assert_payment(
  dblink_error_message('provider') like '%Payment acknowledgement is only available for accepted or completed jobs.%'
  and (select payment_sorted_at is null and payment_sorted_by is null
       from public.bids where id='20000000-0000-4000-8000-000000000020'),
  'after the cancellation commits, the waiting payment call rejects and leaves the bid unchanged');

select dblink_disconnect('provider');
select dblink_disconnect('requester');
\echo Concurrent payment acknowledgement SQL tests passed
