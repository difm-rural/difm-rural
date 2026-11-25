-- Same rollback fixture and real invoker RPC as the duration permission tests.
set local "request.jwt.claim.sub"='';
update services set provider_id='00000000-0000-4000-8000-000000000002' where id='10000000-0000-4000-8000-000000000001';
grant update on services to authenticated;
alter table services enable row level security;
create policy lifecycle_owner on services for all to authenticated using(provider_id=auth.uid()) with check(provider_id=auth.uid());
-- Reuse one confirmed request and add a second commitment to the same listing.
insert into bookings(id,service_id,provider_id,requester_id,status,quantity,total_amount)
values('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','confirmed',1,50);
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select duration_expect_failure($q$select complete_grazing_arrangement('20000000-0000-4000-8000-000000000001',false)$q$);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
select duration_expect_failure($q$select complete_grazing_arrangement('20000000-0000-4000-8000-000000000001',false)$q$);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select complete_grazing_arrangement('20000000-0000-4000-8000-000000000001',false);
do $$begin
 if not exists(select 1 from bookings where id='20000000-0000-4000-8000-000000000001' and status='completed' and total_amount=100 and expected_duration=4) then raise exception 'Completion changed saved terms'; end if;
 if not exists(select 1 from bookings where id='20000000-0000-4000-8000-000000000003' and status='confirmed') then raise exception 'Other booking affected';end if;
 if not exists(select 1 from services where id='10000000-0000-4000-8000-000000000001' and not is_active and closed_at is not null) then raise exception 'Listing not closed';end if;
end$$;
select duration_expect_failure($q$select complete_grazing_arrangement('20000000-0000-4000-8000-000000000001',true)$q$);
select complete_grazing_arrangement('20000000-0000-4000-8000-000000000003',true);
do $$begin if not exists(select 1 from services where id='10000000-0000-4000-8000-000000000001' and is_active and closed_at is null) then raise exception 'Listing not relisted';end if;end$$;
reset role;
select 'PASS selected-booking completion, relist/close, immutable terms, other bookings and owner permissions';

alter table reviews enable row level security;
grant select,insert,update on reviews to authenticated;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
insert into reviews(booking_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating) values('20000000-0000-4000-8000-000000000001',auth.uid(),'00000000-0000-4000-8000-000000000002','requester','provider',5);
select duration_expect_failure($q$insert into reviews(booking_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating) values('20000000-0000-4000-8000-000000000001',auth.uid(),'00000000-0000-4000-8000-000000000002','requester','provider',4)$q$);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
insert into reviews(booking_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating) values('20000000-0000-4000-8000-000000000001',auth.uid(),'00000000-0000-4000-8000-000000000001','provider','requester',4);
select duration_expect_failure($q$insert into reviews(booking_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating) values('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',auth.uid(),'requester','provider',4)$q$);
update reviews set comment='Updated own review' where reviewer_id=auth.uid();
reset role;
do $$begin if (select count(*) from reviews where booking_id='20000000-0000-4000-8000-000000000001')<>2 then raise exception 'Independent reviews or duplicate prevention failed';end if;end$$;
select 'PASS independent per-role reviews, duplicate prevention and reviewer ownership';
