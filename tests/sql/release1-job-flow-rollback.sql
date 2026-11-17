-- Operator smoke test. Run only with approved dedicated test accounts.
-- All fixture writes and notification queues stay in a rolled-back transaction.
begin;
set local statement_timeout='12s';
set local lock_timeout='2s';
do $$
declare
  requester uuid;
  provider uuid;
  fixture_job uuid := gen_random_uuid();
  fixture_bid uuid := gen_random_uuid();
  v_rows integer;
begin
  select id into strict requester from auth.users where lower(email)='test.requester@difmrural.test';
  select id into strict provider from auth.users where lower(email)='test.provider@difmrural.test';
  perform set_config('request.jwt.claim.sub',requester::text,true);
  execute 'set local role authenticated';
  insert into public.jobs(id,requester_id,title,description,visibility,status)
  values(fixture_job,requester,'Release 1 rollback-only test','Temporary offer form smoke fixture','public','open');
  perform set_config('request.jwt.claim.sub',provider::text,true);
  insert into public.bids(id,job_id,provider_id,amount,status,message,available_from,pricing_type,line_items)
  values(fixture_bid,fixture_job,provider,25,'pending','Fixture',current_date+7,'hourly','[{"label":"Fence repair","amount":25}]');
  perform public.update_pending_job_offer_details(fixture_bid,jsonb_build_object(
    'amount',30,'message','Updated fixture','available_from',(current_date+8)::text,'pricing_type','hourly',
    'line_items',jsonb_build_array(jsonb_build_object('label','Fence repair','amount',30)),
    'estimated_duration','One hour'
  ));
  if not exists(select from public.bids where id=fixture_bid and status='pending' and amount=30
     and available_from=(current_date+8)::text and pricing_type='hourly') then raise exception 'Edited offer did not persist in transaction'; end if;
  perform set_config('request.jwt.claim.sub',requester::text,true);
  perform public.accept_job_offer(fixture_bid);
  if not exists(select from public.jobs where id=fixture_job and status='accepted') then raise exception 'Requester acceptance did not award fixture'; end if;
  perform set_config('request.jwt.claim.sub',provider::text,true);
  perform public.confirm_job(fixture_bid,statement_timestamp()+interval '8 days 45 minutes','agreed','',null);
  if not exists(select from public.work_schedules where job_id=fixture_job and arrival_start_at=statement_timestamp()+interval '8 days 45 minutes') then
    raise exception 'Provider arrival did not persist in transaction';
  end if;
  update public.jobs set status='completed' where id=fixture_job and status='accepted';
  get diagnostics v_rows = row_count;
  if v_rows<>1 then raise exception 'Provider completion did not update fixture'; end if;
  reset role;
end $$;
select 'Test requester posting and acceptance, provider submission, editing, arrival and completion passed' as result;
rollback;
