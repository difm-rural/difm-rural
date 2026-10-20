-- Disposable empty local PostgreSQL database only; never use the linked DB.
\set ON_ERROR_STOP on
begin;
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table jobs(id uuid primary key,requester_id uuid,status text default 'open',visibility text default 'public',title text not null,description text not null,category text,price_type text,price numeric,location_name text,location_area text,hide_exact_location boolean,latitude numeric,longitude numeric,location_note text,schedule_type text,scheduled_date text,date_from date,date_to date,materials_type text,access_conditions text[],photos text[],area_polygon jsonb,area_hectares numeric,recurrence_frequency text,repeated_from_job_id uuid,created_at timestamptz default now());
create table bids(id uuid default gen_random_uuid(),job_id uuid,provider_id uuid,status text);
create table services(id uuid primary key,category text);
create table bookings(id uuid primary key,service_id uuid,requester_id uuid,provider_id uuid,status text,created_at timestamptz default now());
create table profiles_public(id uuid primary key,full_name text);
create table job_invites(id uuid default gen_random_uuid(),job_id uuid references jobs(id),requester_id uuid,provider_id uuid,status text default 'pending',unique(job_id,provider_id));
create table fixture_notifications(job_id uuid);
create function count_invite() returns trigger language plpgsql as $$begin insert into fixture_notifications values(new.job_id);return new;end$$;
create trigger notify_fixture after insert on job_invites for each row execute function count_invite();
\ir ../supabase/migrations/20260630120000_connections_view.sql
\ir ../supabase/migrations/20261019205939_web_connection_invites.sql
insert into profiles_public values('00000000-0000-0000-0000-000000000002','Peter');
insert into jobs(id,requester_id,status,title,description) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','completed','Old job','Completed work'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','open','Open job','New work'),('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','accepted','Accepted job','Agreed work');
insert into bids(job_id,provider_id,status) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','accepted');
alter table jobs enable row level security;
create policy job_read on jobs for select to authenticated using(visibility='public' or requester_id=auth.uid());
create policy job_insert on jobs for insert to authenticated with check(requester_id=auth.uid());
create policy job_update on jobs for update to authenticated using(requester_id=auth.uid());
alter table job_invites enable row level security;
create policy invites_read on job_invites for select to authenticated using(requester_id=auth.uid() or provider_id=auth.uid());
create policy invites_insert on job_invites for insert to authenticated with check(requester_id=auth.uid());
grant usage on schema auth to authenticated;
grant select,insert,update on all tables in schema public to authenticated;
create function expect_failure(statement text) returns void language plpgsql as $$begin begin execute statement;exception when others then return;end;raise exception 'Expected rejection: %',statement;end$$;
create function assert_true(value boolean,message text) returns void language plpgsql as $$begin if value is distinct from true then raise exception '%',message;end if;end$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select invite_connection_to_job('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
select invite_connection_to_job('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
select assert_true((select count(*)=1 from fixture_notifications where job_id='10000000-0000-0000-0000-000000000002'),'Retry sent duplicate invite notification');
select expect_failure($q$select invite_connection_to_job('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002')$q$);
select expect_failure($q$select invite_connection_to_job('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003')$q$);
select create_invited_job('20000000-0000-0000-0000-000000000001','{"title":"Private fence","description":"Repair","price_type":"open","status":"completed","visibility":"public","requester_id":"00000000-0000-0000-0000-000000000003"}','00000000-0000-0000-0000-000000000002');
select create_invited_job('20000000-0000-0000-0000-000000000001','{"title":"Private fence","description":"Repair","price_type":"open"}','00000000-0000-0000-0000-000000000002');
select assert_true((select visibility='invite_only' and status='open' and requester_id=auth.uid() from jobs where id='20000000-0000-0000-0000-000000000001'),'Private defaults or ownership were overridden');
select assert_true((select count(*)=1 from fixture_notifications where job_id='20000000-0000-0000-0000-000000000001'),'Private job retry notified twice');
select create_invited_job('20000000-0000-0000-0000-000000000002','{"title":"Public job","description":"Repair","price_type":"open"}','00000000-0000-0000-0000-000000000002',true);
select assert_true((select visibility='public' from jobs where id='20000000-0000-0000-0000-000000000002'),'Explicit public choice was ignored');
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000003';
select expect_failure($q$select invite_connection_to_job('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002')$q$);
select expect_failure($q$select create_invited_job('20000000-0000-0000-0000-000000000003','{"title":"Invalid","description":"Repair","price_type":"open"}','00000000-0000-0000-0000-000000000002')$q$);
reset role;
delete from profiles_public where id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
select expect_failure($q$select create_invited_job('20000000-0000-0000-0000-000000000004','{"title":"Will roll back","description":"Repair","price_type":"open"}','00000000-0000-0000-0000-000000000002')$q$);
select assert_true(not exists(select 1 from jobs where id='20000000-0000-0000-0000-000000000004'),'Failed invitation left an orphan job');
reset role;
rollback;
\echo 'Connection invite SQL checks passed (rolled back).'
