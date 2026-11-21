-- Job location privacy (20261121093421_job_location_locality_only.sql).
-- Replay in isolated PostgreSQL only (schema + migrations applied), like
-- job-invitation-security.test.sql. Everything rolls back.
begin;
do $$
declare
 owner_id uuid := gen_random_uuid();
 provider_id uuid := gen_random_uuid();
 outsider_id uuid := gen_random_uuid();
 admin_id uuid := gen_random_uuid();
 open_job uuid := gen_random_uuid();
 hidden_job uuid := gen_random_uuid();
 offer_id uuid := gen_random_uuid();
 r record;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[owner_id,provider_id,outsider_id,admin_id]) u;
 insert into public.profiles(id,display_name,full_name,primary_role)
 select u,'Synthetic member','Synthetic member','both' from unnest(array[owner_id,provider_id,outsider_id,admin_id]) u
 on conflict(id) do update set full_name=excluded.full_name;
 update public.profiles set is_admin=true where id=admin_id;
 insert into public.jobs(id,requester_id,title,description,status,visibility,location_name,location_area,location_note,latitude,longitude,hide_exact_location)
 values (open_job,owner_id,'Open fixture','Only a test','open','public','12 Kahikatea Road, Waitoki 0871, New Zealand','Waitoki','Gate code 1234',-36.654321,174.512345,false),
        (hidden_job,owner_id,'Hidden fixture','Only a test','open','public','14 Kahikatea Road, Waitoki 0871, New Zealand','Waitoki',null,-36.6,174.5,true);

 set local role authenticated;

 -- An unrelated signed-in user sees the locality and ~1 km coordinates only.
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 select * into r from public.jobs_public j where j.id=open_job;
 if r.location_name is distinct from 'Waitoki' or r.location_note is not null or r.area_polygon is not null
    or r.latitude is distinct from -36.65 or r.longitude is distinct from 174.51 or r.location_exact
 then raise exception 'Public job exposes more than locality: %',row_to_json(r); end if;
 select * into r from public.jobs_public j where j.id=hidden_job;
 if r.location_name is not null or r.latitude is not null or r.longitude is not null or r.location_exact
 then raise exception 'Hidden job exposes location: %',row_to_json(r); end if;
 if exists(select 1 from public.jobs j where j.id in (open_job,hidden_job))
 then raise exception 'Raw jobs readable by a non-participant'; end if;

 -- A pending offer does not unlock the exact location.
 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 insert into public.bids(id,job_id,provider_id,status,amount) values(offer_id,open_job,provider_id,'pending',100);
 if exists(select 1 from public.jobs_public j where j.id=open_job and (j.location_exact or j.location_note is not null))
 then raise exception 'Pending offer unlocked exact location'; end if;

 -- The owner always sees the exact location.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 if not exists(select 1 from public.jobs_public j where j.id=open_job and j.location_exact
    and j.location_name like '12 Kahikatea Road%' and j.latitude=-36.654321 and j.location_note='Gate code 1234')
 then raise exception 'Owner lost exact location'; end if;

 -- Admins see the exact location, including a hidden job.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not exists(select 1 from public.jobs_public j where j.id=open_job and j.location_exact and j.latitude=-36.654321 and j.location_note='Gate code 1234')
    or not exists(select 1 from public.jobs_public j where j.id=hidden_job and j.location_exact and j.location_name like '14 Kahikatea Road%')
 then raise exception 'Admin lost exact location'; end if;

 -- Once the owner accepts the offer, the awarded provider sees the exact location.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.accept_job_offer(offer_id);
 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 if not exists(select 1 from public.jobs_public j where j.id=open_job and j.location_exact
    and j.location_name like '12 Kahikatea Road%' and j.latitude=-36.654321)
 then raise exception 'Accepted provider lost exact location'; end if;
 -- Acceptance on one job unlocks nothing on another job.
 if exists(select 1 from public.jobs_public j where j.id=hidden_job and (j.location_exact or j.location_name is not null))
 then raise exception 'Acceptance leaked another job location'; end if;
 -- The unrelated user is still masked after the award.
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 if exists(select 1 from public.jobs_public j where j.id=open_job and (j.location_exact or j.location_name<>'Waitoki'))
 then raise exception 'Award leaked location to an unrelated user'; end if;

 -- Guests never see an exact location.
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 set local role anon;
 if exists(select 1 from public.jobs_public j where j.location_exact or j.location_name like '%Kahikatea Road%')
 then raise exception 'Guest sees exact location'; end if;
 reset role;
end $$;
rollback;
