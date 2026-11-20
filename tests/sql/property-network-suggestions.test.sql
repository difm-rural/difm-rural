-- My Property Network: offers after completed work. Disposable empty local
-- PostgreSQL 17 database only; never use the linked DB. Shims the Supabase
-- pieces the migrations rely on and applies them (they commit), then runs the
-- checks in a transaction that rolls back:
--   psql -X -h 127.0.0.1 -p <port> -U postgres -d postgres -f tests/sql/property-network-suggestions.test.sql
\set ON_ERROR_STOP on
begin;
create schema auth;
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to anon,authenticated;
-- From 20261118200000_assistant_tokens_read_only.sql.
create function public.is_assistant_token() returns boolean language sql stable set search_path='' as $$select (auth.jwt()->>'client_id') is not null$$;
create function public.refuse_assistant_token() returns void language plpgsql stable set search_path='' as $$
begin if public.is_assistant_token() then raise exception 'AI assistants have read-only access to Rural Connections' using errcode='42501'; end if; end $$;
grant execute on function public.is_assistant_token(),public.refuse_assistant_token() to anon,authenticated;
create table public.profiles(id uuid primary key,full_name text);
create view public.profiles_public as select id,full_name,null::text display_name,null::text region from public.profiles;
grant select on public.profiles_public to authenticated;
grant usage on schema public to anon,authenticated;
\ir ../../supabase/migrations/20261118170000_property_network.sql
\ir ../../supabase/migrations/20261118224050_property_network_more_areas.sql
\ir ../../supabase/migrations/20261120074030_property_network_sorted_status.sql
\ir ../../supabase/migrations/20261120083245_property_network_suggestions.sql
-- The migrations commit, so the checks below run in their own transaction.
begin;
create function expect_failure(statement text,code text default null) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if code is not null and sqlstate<>code then raise exception 'Expected % but got %: % (%)',code,sqlstate,sqlerrm,statement; end if;
  return;
 end;
 raise exception 'Expected rejection: %',statement;
end $$;
create function assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
grant execute on function expect_failure(text,text),assert_true(boolean,text) to anon,authenticated;
insert into public.profiles values
 ('00000000-0000-0000-0000-00000000000a','Owner A'),
 ('00000000-0000-0000-0000-00000000000b','Owner B'),
 ('00000000-0000-0000-0000-00000000000c','Provider C');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000a';
-- 'sorted' is now a valid status.
insert into public.property_network_services(owner_id,area,service_key,name,status) values(auth.uid(),'water','suggested-4','Tank cleaning','sorted');
select expect_failure($q$insert into public.property_network_services(owner_id,area,service_key,name,status) values(auth.uid(),'water','suggested-3','Troughs','done')$q$,'23514');
-- Accepting switches an inactive area on and links the provider (has_provider).
insert into public.property_network_areas values(auth.uid(),'fencing',false);
insert into public.property_network_services(owner_id,area,service_key,name,status) values(auth.uid(),'fencing','suggested-1','Fence repairs','needs_help');
select public.accept_property_network_suggestion('fencing','suggested-1','Fence repairs','00000000-0000-0000-0000-00000000000c');
select assert_true((select active from public.property_network_areas where area='fencing'),'Accept did not activate the area');
select assert_true((select status='has_provider' from public.property_network_services where area='fencing' and service_key='suggested-1'),'Accept did not mark the service');
select assert_true((select count(*)=1 from public.property_network_providers where area='fencing' and provider_id='00000000-0000-0000-0000-00000000000c'),'Accept did not link the provider');
-- A member with no rows yet: accepting creates the area as active.
select public.accept_property_network_suggestion('water','suggested-2','Pump repairs','00000000-0000-0000-0000-00000000000c');
select public.accept_property_network_suggestion('water','suggested-2','Pump repairs','00000000-0000-0000-0000-00000000000c');
select assert_true((select active from public.property_network_areas where area='water'),'Accept did not add the area');
select assert_true((select count(*)=1 from public.property_network_providers where area='water'),'Repeat accept duplicated the link');
select expect_failure($q$select public.accept_property_network_suggestion('water','suggested-1','Water delivery',auth.uid())$q$);
-- A failed accept leaves no half-change behind.
select expect_failure($q$select public.accept_property_network_suggestion('trees','suggested-1','Tree trimming',gen_random_uuid())$q$);
select assert_true(not exists(select 1 from public.property_network_areas where area='trees'),'Failed accept still activated the area');
-- "Not now" is stored per provider and area, once.
insert into public.property_network_suggestion_dismissals(owner_id,provider_id,area) values(auth.uid(),'00000000-0000-0000-0000-00000000000c','trees');
insert into public.property_network_suggestion_dismissals(owner_id,provider_id,area) values(auth.uid(),'00000000-0000-0000-0000-00000000000c','trees') on conflict do nothing;
select assert_true((select count(*)=1 from public.property_network_suggestion_dismissals),'Dismissal duplicated');
select expect_failure($q$insert into public.property_network_suggestion_dismissals(owner_id,provider_id,area) values(auth.uid(),'00000000-0000-0000-0000-00000000000c','garden')$q$,'23514');
select expect_failure($q$delete from public.property_network_suggestion_dismissals$q$,'42501');
-- Another owner can neither read nor write A's dismissals.
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000b';
select assert_true((select count(*)=0 from public.property_network_suggestion_dismissals),'Another owner read dismissals');
select expect_failure($q$insert into public.property_network_suggestion_dismissals values('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000c','water',now())$q$,'42501');
-- An AI assistant token can do neither.
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-00000000000a","client_id":"assistant"}';
select expect_failure($q$select public.accept_property_network_suggestion('trees','suggested-1','Tree trimming','00000000-0000-0000-0000-00000000000c')$q$,'42501');
select expect_failure($q$insert into public.property_network_suggestion_dismissals(owner_id,provider_id,area) values(auth.uid(),'00000000-0000-0000-0000-00000000000c','water')$q$,'42501');
set local "request.jwt.claims"='';
reset role;
set local role anon;
select expect_failure($q$select 1 from public.property_network_suggestion_dismissals$q$,'42501');
reset role;
rollback;
\echo 'Property network suggestion SQL checks passed (rolled back).'
