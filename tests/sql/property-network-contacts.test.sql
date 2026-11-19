-- My Property Network private contacts. Disposable empty local PostgreSQL 17
-- database only; never use the linked DB. Shims the Supabase pieces the
-- property network migrations rely on and applies them (they commit), then runs
-- the checks in a transaction that rolls back:
--   psql -X -h 127.0.0.1 -p <port> -U postgres -d postgres -f tests/sql/property-network-contacts.test.sql
-- tests/sql/property-network.test.sql covers the member links on a full schema.
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
\ir ../../supabase/migrations/20261119022010_property_network_contacts.sql
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
 ('00000000-0000-0000-0000-00000000000c','Member C');

-- Owner A adds a contact and links it to two services.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000a';
insert into public.property_network_contacts(id,owner_id,name,phone,email,note)
 values('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Bob the fencer','021 555 0101','bob@example.test','Cash only');
select public.link_property_network_contact('fencing','suggested-1','Fence repairs','c0000000-0000-0000-0000-000000000001');
select public.link_property_network_contact('fencing','suggested-1','Fence repairs','c0000000-0000-0000-0000-000000000001');
select public.link_property_network_contact('water','suggested-2','Pump repairs','c0000000-0000-0000-0000-000000000001');
select assert_true((select count(*)=2 from public.property_network_contact_links),'Contact links missing or duplicated');
select assert_true((select bool_and(status='has_provider') from public.property_network_services),'Linking did not mark the service as covered');
update public.property_network_contacts set note='Phone after 5pm' where id='c0000000-0000-0000-0000-000000000001';

-- Bad values are rejected by the table checks.
select expect_failure($q$insert into public.property_network_contacts(owner_id,name) values(auth.uid(),' Padded ')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name) values(auth.uid(),'')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name) values(auth.uid(),repeat('x',81))$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,phone) values(auth.uid(),'X','call me')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,phone) values(auth.uid(),'X','+64 (21) 555-0101 555 0101 5555')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,phone) values(auth.uid(),'X','()-')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,email) values(auth.uid(),'X','not-an-email')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,email) values(auth.uid(),'X','Bob@Example.test')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,email) values(auth.uid(),'X','a b@example.test')$q$,'23514');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name,note) values(auth.uid(),'X',repeat('n',201))$q$,'23514');
insert into public.property_network_contacts(owner_id,name,phone,email) values(auth.uid(),'Valid','+64 (21) 555-0101','a.b+c@farm.co.nz');

-- Another owner cannot see, change, delete, link or replace A's contact.
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000b';
select assert_true((select count(*)=0 from public.property_network_contacts),'Another owner read private contacts');
select assert_true((select count(*)=0 from public.property_network_contact_links),'Another owner read private contact links');
update public.property_network_contacts set name='Hijacked';
delete from public.property_network_contacts;
select expect_failure($q$insert into public.property_network_contacts(owner_id,name) values('00000000-0000-0000-0000-00000000000a','Planted')$q$,'42501');
select expect_failure($q$select public.link_property_network_contact('fencing','suggested-1','Fence repairs','c0000000-0000-0000-0000-000000000001')$q$,'23503');
select expect_failure($q$insert into public.property_network_contact_links values('00000000-0000-0000-0000-00000000000a','fencing','suggested-1','c0000000-0000-0000-0000-000000000001')$q$,'42501');
select expect_failure($q$select public.replace_property_network_contact('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c')$q$,'P0002');
reset role;
select assert_true((select name='Bob the fencer' from public.property_network_contacts where id='c0000000-0000-0000-0000-000000000001'),'Another owner changed a contact');
select assert_true((select count(*)=2 from public.property_network_contact_links),'Another owner changed contact links');
select assert_true((select count(*)=0 from public.property_network_services where owner_id='00000000-0000-0000-0000-00000000000b'),'Refused link left a service behind');

-- Guests have no access at all.
set local role anon;
select expect_failure($q$select 1 from public.property_network_contacts$q$,'42501');
select expect_failure($q$select 1 from public.property_network_contact_links$q$,'42501');
select expect_failure($q$select public.link_property_network_contact('water','suggested-1','Water delivery',gen_random_uuid())$q$,'42501');
reset role;

-- An AI assistant token for owner A can neither read nor write.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-00000000000a';
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-00000000000a","client_id":"assistant"}';
select assert_true((select count(*)=0 from public.property_network_contacts),'Assistant token read private contacts');
select assert_true((select count(*)=0 from public.property_network_contact_links),'Assistant token read private contact links');
select expect_failure($q$insert into public.property_network_contacts(owner_id,name) values(auth.uid(),'Assistant')$q$,'42501');
select expect_failure($q$select public.link_property_network_contact('water','suggested-1','Water delivery','c0000000-0000-0000-0000-000000000001')$q$,'42501');
select expect_failure($q$select public.replace_property_network_contact('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c')$q$,'42501');
update public.property_network_contacts set name='Assistant edit';
delete from public.property_network_contact_links;
set local "request.jwt.claims"='';
select assert_true((select count(*)=2 from public.property_network_contacts),'Assistant token changed contacts');
select assert_true((select count(*)=2 and bool_and(true) from public.property_network_contact_links),'Assistant token deleted contact links');
select assert_true((select name='Bob the fencer' from public.property_network_contacts where id='c0000000-0000-0000-0000-000000000001'),'Assistant token edited a contact');

-- "They've joined": the member takes over every service, the contact goes.
select expect_failure($q$select public.replace_property_network_contact('c0000000-0000-0000-0000-000000000001',auth.uid())$q$);
select public.replace_property_network_contact('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c');
select assert_true((select count(*)=2 from public.property_network_providers where provider_id='00000000-0000-0000-0000-00000000000c'),'Replace did not move every link');
select assert_true((select array_agg(area||'/'||service_key order by area) from public.property_network_providers)=array['fencing/suggested-1','water/suggested-2'],'Replace linked the wrong services');
select assert_true(not exists(select 1 from public.property_network_contacts where id='c0000000-0000-0000-0000-000000000001'),'Replace kept the contact');
select assert_true(not exists(select 1 from public.property_network_contact_links),'Replace kept contact links');
select assert_true((select count(*)=1 from public.property_network_contacts),'Replace removed another contact');
-- A failed replace changes nothing.
insert into public.property_network_contacts(id,owner_id,name) values('c0000000-0000-0000-0000-000000000002',auth.uid(),'Ann');
select public.link_property_network_contact('trees','suggested-3','Firewood','c0000000-0000-0000-0000-000000000002');
select expect_failure($q$select public.replace_property_network_contact('c0000000-0000-0000-0000-000000000002',gen_random_uuid())$q$);
select assert_true((select count(*)=1 from public.property_network_contact_links where contact_id='c0000000-0000-0000-0000-000000000002'),'Failed replace lost links');
-- Deleting a contact removes its links but keeps the service.
delete from public.property_network_contacts where id='c0000000-0000-0000-0000-000000000002';
select assert_true(not exists(select 1 from public.property_network_contact_links),'Deleted contact kept links');
select assert_true(exists(select 1 from public.property_network_services where area='trees'),'Deleting a contact removed the service');
reset role;
rollback;
\echo 'Property network contact SQL checks passed (rolled back).'
