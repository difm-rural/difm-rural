-- Invoked by the local-only rollback harness with actual existing booking RLS
-- and enforce_booking_update_rules, plus the pending migration under review.
alter table public.bookings enable row level security;
grant select,insert,update on public.bookings to authenticated;
grant select on public.bookings to anon;
grant select on public.services to authenticated;
create trigger bookings_enforce_update_rules before update on public.bookings for each row execute function public.enforce_booking_update_rules();
create function public.duration_expect_failure(statement text) returns void language plpgsql as $$begin
 begin execute statement;exception when others then return;end;
 raise exception 'Expected rejection: %',statement;
end$$;
insert into services(id,kind,pricing_type,unit_label,pricing_variants,max_units) values
 ('10000000-0000-4000-8000-000000000001','grazing','per_unit','head/week','[]',10),
 ('10000000-0000-4000-8000-000000000002','hire','day_rate','day','[]',null),
 ('10000000-0000-4000-8000-000000000003','service','fixed',null,'[]',null);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
set local role authenticated;
-- Valid grazing duration, and an old client omitting both new fields/snapshot.
insert into bookings(id,service_id,provider_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot)
 values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',auth.uid(),2,100,4,'week','{"version":1,"pricing_type":"per_unit","unit_label":"head/week"}');
insert into bookings(id,service_id,provider_id,requester_id,quantity,total_amount)
 values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',auth.uid(),2,100);
do $$begin
 if exists(select 1 from bookings where id='20000000-0000-4000-8000-000000000002' and expected_duration is not null) then raise exception 'Legacy booking backfilled';end if;
end$$;
-- Updating duration is forbidden even before acceptance; notes/snapshot guards remain.
select duration_expect_failure($q$update bookings set expected_duration=6 where id='20000000-0000-4000-8000-000000000001'$q$);
select duration_expect_failure($q$update bookings set expected_duration_unit='day' where id='20000000-0000-4000-8000-000000000001'$q$);
select duration_expect_failure($q$update bookings set pricing_snapshot='{}' where id='20000000-0000-4000-8000-000000000001'$q$);
-- Exercise each invalid request through the actual insert policies and trigger.
do $$declare value numeric;begin
 foreach value in array array[0,-1,3,1.5,10001,'NaN'::numeric] loop
  perform duration_expect_failure(format($q$insert into bookings(service_id,provider_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot)
  values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',auth.uid(),2,100,%L,'week','{"version":1}')$q$,value));
 end loop;
end$$;
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot) values('10000000-0000-4000-8000-000000000001',auth.uid(),2,100,4,'month','{"version":1}')$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit) values('10000000-0000-4000-8000-000000000001',auth.uid(),2,100,4,'week')$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot) values('10000000-0000-4000-8000-000000000001',auth.uid(),2,100,4,'week','{}')$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount) values('10000000-0000-4000-8000-000000000001',auth.uid(),1.5,100)$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount) values('10000000-0000-4000-8000-000000000001',auth.uid(),11,100)$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot) values('10000000-0000-4000-8000-000000000003',auth.uid(),1,50,4,'week','{"version":1}')$q$);
-- Time quantities represent duration directly, without multiplying twice.
insert into bookings(service_id,requester_id,provider_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot)
 values('10000000-0000-4000-8000-000000000002',auth.uid(),'00000000-0000-4000-8000-000000000002',4,200,4,'day','{"version":1,"pricing_type":"day_rate","unit_label":"day"}');
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot) values('10000000-0000-4000-8000-000000000002',auth.uid(),2,100,4,'day','{"version":1,"pricing_type":"day_rate","unit_label":"day"}')$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration,expected_duration_unit,pricing_snapshot) values('10000000-0000-4000-8000-000000000002',auth.uid(),1.234,100,1.234,'day','{"version":1,"pricing_type":"day_rate","unit_label":"day"}')$q$);
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount,expected_duration_unit) values('10000000-0000-4000-8000-000000000002',auth.uid(),2,100,'day')$q$);
-- Outsiders cannot insert for another requester or see private requests.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
select duration_expect_failure($q$insert into bookings(service_id,requester_id,quantity,total_amount) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',2,100)$q$);
do $$begin if exists(select 1 from bookings) then raise exception 'Cross-member booking leak';end if;end$$;
-- Provider can still accept; duration and snapshot stay exactly as requested.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
update bookings set status='confirmed' where id='20000000-0000-4000-8000-000000000001';
select duration_expect_failure($q$update bookings set expected_duration=8 where id='20000000-0000-4000-8000-000000000001'$q$);
do $$begin
 if not exists(select 1 from bookings where id='20000000-0000-4000-8000-000000000001' and status='confirmed' and expected_duration=4 and expected_duration_unit='week' and total_amount=100) then raise exception 'Acceptance changed request terms';end if;
end$$;
-- Older requesters can withdraw a pending legacy booking as before.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
update bookings set status='withdrawn' where id='20000000-0000-4000-8000-000000000002';
reset role;
do $$begin
 if public.booking_duration_period('per_unit','machine/day')<>'day' or public.booking_duration_period('per_unit','head/month')<>'month'
 or public.booking_duration_period('per_unit','load') is not null then raise exception 'Advertised unit parsing changed';end if;
end$$;
set local "request.jwt.claim.sub"='';
set local role anon;
do $$begin if exists(select 1 from bookings) then raise exception 'Anonymous booking leak';end if;end$$;
reset role;
select 'PASS optional duration, invalid values, units, capacity, legacy clients, immutable terms, acceptance and requester/provider/anonymous permissions';
