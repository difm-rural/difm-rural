-- Run ONLY in a disposable empty local PostgreSQL database.
\set ON_ERROR_STOP on
do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end$$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_assistant_token() returns boolean language sql stable as $$select coalesce(current_setting('request.test_assistant',true),'')='true'$$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid(),public.is_assistant_token() to authenticated;
create table public.profiles(id uuid primary key,full_name text);
create view public.profiles_public as select * from public.profiles;
create table public.jobs(id uuid primary key,requester_id uuid references public.profiles(id),status text);
alter table public.jobs enable row level security;
create policy own_jobs on public.jobs for select to authenticated using(requester_id=auth.uid());
grant select on public.jobs,public.profiles_public to authenticated;
\ir ../../supabase/migrations/20261118170000_property_network.sql
\ir ../../supabase/migrations/20261124090000_property_network_job_links.sql
insert into profiles values('10000000-0000-4000-8000-000000000001','Owner'),('10000000-0000-4000-8000-000000000002','Other owner'),('10000000-0000-4000-8000-000000000003','Provider'),('10000000-0000-4000-8000-000000000004','Replacement');
insert into jobs values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','accepted'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','completed'),('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','open'),('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','cancelled');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into property_network_areas values(auth.uid(),'water',true);
select link_property_network_provider('water','suggested-1','Water delivery','10000000-0000-4000-8000-000000000003');
select link_property_network_provider('water','suggested-1','Water delivery','10000000-0000-4000-8000-000000000003');
do $$begin if (select count(*) from property_network_providers)<>1 then raise exception 'duplicate provider link';end if;end$$;
update property_network_services set status='needs_help';
select replace_property_network_provider('water','suggested-1','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
do $$begin if (select status from property_network_services limit 1)<>'needs_help' then raise exception 'replacement cleared Needs help';end if;
 begin perform replace_property_network_provider('water','suggested-1','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000099');raise exception 'invalid replacement succeeded';exception when foreign_key_violation or insufficient_privilege then null;end;
 if not exists(select 1 from property_network_providers where provider_id='10000000-0000-4000-8000-000000000004') then raise exception 'failed replacement removed assignment';end if;end$$;
do $$begin if (select count(*) from property_network_providers)<>1 then raise exception 'provider replacement failed';end if;end$$;
insert into property_network_jobs values(auth.uid(),'water','20000000-0000-4000-8000-000000000001'),(auth.uid(),'water','20000000-0000-4000-8000-000000000002');
do $$begin
 begin insert into property_network_jobs values(auth.uid(),'water','20000000-0000-4000-8000-000000000003');raise exception 'linked someone elses job';exception when insufficient_privilege then null;end;
 begin insert into property_network_jobs values(auth.uid(),'water','20000000-0000-4000-8000-000000000004');raise exception 'linked cancelled job';exception when insufficient_privilege then null;end;
end$$;
-- A fresh session as the owner sees persisted links.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$begin if (select count(*) from property_network_jobs)<>2 then raise exception 'links did not persist';end if;end$$;
-- A provider and an unrelated owner see neither assignments nor job links.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$begin if exists(select 1 from property_network_jobs) or exists(select 1 from property_network_providers) then raise exception 'private network exposed to provider';end if;end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
 if exists(select 1 from property_network_jobs) or exists(select 1 from property_network_providers) then raise exception 'private network exposed';end if;
 begin perform replace_property_network_provider('water','suggested-1','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003');raise exception 'cross-owner replacement';exception when raise_exception then if sqlerrm <> 'Assignment unavailable' then raise;end if;end;
 delete from property_network_jobs;
 begin insert into property_network_jobs values('10000000-0000-4000-8000-000000000001','water','20000000-0000-4000-8000-000000000001');raise exception 'spoofed owner';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select set_config('request.test_assistant','true',false);
do $$begin
 if exists(select 1 from property_network_jobs) then raise exception 'assistant can read links';end if;
 begin insert into property_network_jobs values(auth.uid(),'water','20000000-0000-4000-8000-000000000001');raise exception 'assistant inserted';exception when insufficient_privilege then null;end;
 delete from property_network_jobs;
end$$;
select set_config('request.test_assistant','false',false);
do $$begin if (select count(*) from property_network_jobs)<>2 then raise exception 'other actor removed links';end if;end$$;
delete from property_network_jobs where job_id='20000000-0000-4000-8000-000000000001';
delete from property_network_providers;
do $$begin if (select count(*) from property_network_jobs)<>1 or exists(select 1 from property_network_providers) then raise exception 'unlink failed';end if;end$$;
reset role;
do $$begin if (select count(*) from profiles)<>4 then raise exception 'assignment duplicated profiles';end if;end$$;
set role anon;
do $$begin begin perform 1 from property_network_jobs;raise exception 'anonymous read';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'PASS: assignment persistence/change/removal, owned job links, cross-owner/provider/anonymous/assistant isolation' as result;

