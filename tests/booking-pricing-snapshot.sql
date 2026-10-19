-- Use a disposable empty local database only; all fixtures roll back.
\set ON_ERROR_STOP on
begin;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.bookings(id integer primary key,total_amount numeric,status text);
\ir ../supabase/migrations/20261019150000_booking_pricing_snapshot.sql
create function public.expect_failure(statement text) returns void language plpgsql as $$begin begin execute statement;exception when others then return;end;raise exception 'Expected rejection: %',statement;end$$;
insert into bookings(id,total_amount,status) values(1,150,'pending');
insert into bookings values(2,300,'pending','{"version":1,"option_label":"Specialist work","base_amount":300}');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select expect_failure($q$update bookings set pricing_snapshot='{"version":1,"base_amount":1}' where id=2$q$);
select expect_failure($q$update bookings set pricing_snapshot=null where id=2$q$);
select expect_failure($q$update bookings set pricing_snapshot='{}' where id=1$q$);
select expect_failure($q$insert into bookings values(3,10,'pending','[]')$q$);
-- Quotes can update their own fields while the initial reviewed estimate remains fixed.
update bookings set total_amount=400,status='quote_sent' where id=2;
do $$begin
 if (select total_amount<>400 or pricing_snapshot->>'base_amount'<>'300' from bookings where id=2) then raise exception 'Quote update changed historical pricing';end if;
 if (select pricing_snapshot is not null from bookings where id=1) then raise exception 'Legacy request was backfilled';end if;
end$$;
rollback;
\echo 'Booking pricing snapshot checks passed (rolled back).'
