-- Run only against a disposable local database, never the linked application DB.
\set ON_ERROR_STOP on
begin;
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.jobs(id uuid primary key,requester_id uuid,status text);
create table public.bids(id uuid primary key,job_id uuid references public.jobs(id) on delete cascade,provider_id uuid,status text,amount numeric,message text,line_items jsonb,pricing_type text,materials text,available_from text,estimated_duration text);
\ir ../supabase/migrations/20261019130000_web_job_management.sql
\ir ../supabase/migrations/20261019140000_web_job_offer_details.sql
\ir ../supabase/migrations/20261019120000_accept_job_offer.sql
create function public.expect_failure(statement text) returns void language plpgsql as $$begin begin execute statement; exception when others then return; end;raise exception 'Expected rejection: %',statement;end$$;
create function public.assert_true(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception '%',message;end if;end$$;
insert into jobs values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','open'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','cancelled'),('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','completed'),('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','open');
insert into bids(id,job_id,provider_id,status,amount,message) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','pending',100,'Original');
select expect_failure($q$select change_pending_job_offer('20000000-0000-0000-0000-000000000001','withdraw')$q$);
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select expect_failure($q$select change_pending_job_offer('20000000-0000-0000-0000-000000000001','withdraw')$q$);
select expect_failure($q$select delete_managed_job('10000000-0000-0000-0000-000000000001')$q$);
select expect_failure($q$select delete_managed_job('10000000-0000-0000-0000-000000000003')$q$);
select delete_managed_job('10000000-0000-0000-0000-000000000004');
select assert_true(not exists(select 1 from jobs where id='10000000-0000-0000-0000-000000000004'),'Empty open job was not deleted');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
select expect_failure($q$select delete_managed_job('10000000-0000-0000-0000-000000000002')$q$);
select expect_failure($q$select update_pending_job_offer_details('20000000-0000-0000-0000-000000000001','{"amount":999,"line_items":[{"label":"Labour","amount":120}],"pricing_type":"fixed"}')$q$);
select update_pending_job_offer_details('20000000-0000-0000-0000-000000000001','{"amount":150,"line_items":[{"label":"Labour","amount":120},{"label":"Travel","amount":30}],"pricing_type":"hourly","message":"","available_from":"2026-10-22","estimated_duration":"One day","materials":"included"}');
select assert_true((select amount=150 and pricing_type='hourly' and message is null and jsonb_array_length(line_items)=2 and available_from='2026-10-22' from bids where id='20000000-0000-0000-0000-000000000001'),'Detailed offer update lost terms');
select expect_failure($q$select change_pending_job_offer('20000000-0000-0000-0000-000000000001','edit',99,'Bypass details')$q$);
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select accept_job_offer('20000000-0000-0000-0000-000000000001');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
select expect_failure($q$select change_pending_job_offer('20000000-0000-0000-0000-000000000001','withdraw')$q$);
select expect_failure($q$select update_pending_job_offer_details('20000000-0000-0000-0000-000000000001','{"amount":100,"line_items":[{"label":"Labour","amount":100}],"pricing_type":"fixed"}')$q$);
select assert_true((select status='accepted' and amount=150 from bids where id='20000000-0000-0000-0000-000000000001'),'Accepted offer was modified');
update jobs set status='open' where id='10000000-0000-0000-0000-000000000001';
update bids set status='pending' where id='20000000-0000-0000-0000-000000000001';
select change_pending_job_offer('20000000-0000-0000-0000-000000000001','withdraw');
select assert_true(not exists(select 1 from bids where id='20000000-0000-0000-0000-000000000001'),'Pending offer was not withdrawn');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select delete_managed_job('10000000-0000-0000-0000-000000000002');
select assert_true(not exists(select 1 from jobs where id='10000000-0000-0000-0000-000000000002'),'Cancelled job was not deleted');
rollback;
\echo 'Job management SQL regression checks passed (rolled back).'
