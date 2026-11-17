-- Run only after restoring the repository schema into a disposable PostgreSQL
-- database with Auth fixtures and non-networking extension shims.
\set ON_ERROR_STOP on
begin;
set local row_security = on;
grant usage on schema auth to authenticated;

create function pg_temp.assert_payment(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Payment acknowledgement: %', label; end if;
end;
$$;

\ir payment-acknowledgement-fixture.sql

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020');
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020');
select pg_temp.assert_payment(
 (select payment_sorted_at is not null and payment_sorted_by=auth.uid() from public.bids where id='20000000-0000-4000-8000-000000000020')
 and (select status='accepted' from public.jobs where id='20000000-0000-4000-8000-000000000010'),
 'requester can acknowledge before confirmation without changing work status');
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020',true);
select pg_temp.assert_payment((select payment_sorted_at is null and payment_sorted_by is null from public.bids
 where id='20000000-0000-4000-8000-000000000020'),'provider can undo requester acknowledgement');
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020');
select pg_temp.assert_payment((select payment_sorted_at is not null and payment_sorted_by=auth.uid() from public.bids
 where id='20000000-0000-4000-8000-000000000020'),'provider can acknowledge');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';
do $$
declare undo boolean;
begin
  foreach undo in array array[false,true] loop
    begin
      perform public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000020',undo);
      raise exception 'outsider unexpectedly succeeded';
    exception when raise_exception then
      if sqlerrm <> 'Only the requester or the accepted provider can update payment.' then raise; end if;
    end;
  end loop;
end;
$$;

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select public.confirm_job('20000000-0000-4000-8000-000000000021',now()+interval '1 day','agreed','',null);
reset role;
create temporary table payment_before_completion as
 select id,payment_sorted_at,payment_sorted_by from public.bids
 where id in ('20000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000021');
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
update public.jobs set status='completed'
 where id in ('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000011');
insert into public.reviews(job_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating)
values ('20000000-0000-4000-8000-000000000011',auth.uid(),'20000000-0000-4000-8000-000000000001','provider','requester',5);
reset role;
select pg_temp.assert_payment(
 (select count(*)=2 from public.jobs where id in ('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000011') and status='completed')
 and not exists (select from payment_before_completion t join public.bids b using(id)
 where (t.payment_sorted_at,t.payment_sorted_by) is distinct from (b.payment_sorted_at,b.payment_sorted_by))
 and (select count(*)=1 from public.reviews where job_id='20000000-0000-4000-8000-000000000011')
 and (select count(*)=1 from public.notifications where type='payment_sorted' and user_id='20000000-0000-4000-8000-000000000002'
   and metadata->>'bid_id'='20000000-0000-4000-8000-000000000020'),
 'completion preserves both acknowledgement states, review works without payment and duplicate set is a no-op');
select pg_temp.assert_payment(
 not has_function_privilege('anon', 'public.mark_job_payment_sorted(uuid,boolean)', 'EXECUTE')
 and has_function_privilege('authenticated', 'public.mark_job_payment_sorted(uuid,boolean)', 'EXECUTE'),
 'RPC remains inaccessible to anonymous callers');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021');
select pg_temp.assert_payment((select payment_sorted_by=auth.uid() and payment_sorted_at is not null
 from public.bids where id='20000000-0000-4000-8000-000000000021'),'requester can mark after completion');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000003';
do $$
declare undo boolean;
begin
  foreach undo in array array[false,true] loop
    begin
      perform public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021',undo);
      raise exception 'completed job outsider unexpectedly succeeded';
    exception when raise_exception then
      if sqlerrm <> 'Only the requester or the accepted provider can update payment.' then raise; end if;
    end;
  end loop;
end;
$$;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021',true);
select pg_temp.assert_payment((select payment_sorted_at is null and payment_sorted_by is null
 from public.bids where id='20000000-0000-4000-8000-000000000021'),'provider can undo after completion');
select public.mark_job_payment_sorted('20000000-0000-4000-8000-000000000021');
select pg_temp.assert_payment((select payment_sorted_by=auth.uid() and payment_sorted_at is not null
 from public.bids where id='20000000-0000-4000-8000-000000000021'),'provider can mark after completion');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select public.mark_job_payment_sent('20000000-0000-4000-8000-000000000021',true);
select pg_temp.assert_payment((select payment_sorted_at is null and payment_sorted_by is null
 from public.bids where id='20000000-0000-4000-8000-000000000021'),'requester can undo after completion via legacy wrapper');
do $$
declare
  fixture record;
  undo boolean;
begin
  for fixture in select * from (values
    ('20000000-0000-4000-8000-000000000022'::uuid,'Payment acknowledgement is only available for accepted or completed jobs.'),
    ('20000000-0000-4000-8000-000000000023','Payment acknowledgement is only available for accepted or completed jobs.'),
    ('20000000-0000-4000-8000-000000000024','Only the requester or the accepted provider can update payment.'),
    ('20000000-0000-4000-8000-000000000025','This job does not have a valid winning offer.'),
    ('20000000-0000-4000-8000-000000000099','This offer is unavailable.')
  ) as cases(bid,message) loop
    foreach undo in array array[false,true] loop
      begin
        perform public.mark_job_payment_sorted(fixture.bid,undo);
        raise exception 'invalid job or bid unexpectedly succeeded';
      exception when raise_exception then
        if sqlerrm <> fixture.message then raise; end if;
      end;
    end loop;
  end loop;
end;
$$;
reset role;
select pg_temp.assert_payment(
 (select status='completed' from public.jobs where id='20000000-0000-4000-8000-000000000011')
 and (select count(*) = 4 from public.notifications
      where metadata->>'bid_id'='20000000-0000-4000-8000-000000000021'
        and type in ('payment_sorted','payment_unsorted'))
 and (select count(*) = 4 from public.messages
      where job_id='20000000-0000-4000-8000-000000000011' and content like 'Payment%'),
 'each post-completion change keeps completed status and emits the existing audit message and notification');
rollback;
\echo Payment acknowledgement SQL tests passed
