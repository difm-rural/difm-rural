-- Filled-jobs activity privacy (20261121194225_filled_jobs_coarse_location.sql).
-- Replay in isolated PostgreSQL only (schema + migrations applied), like
-- job-location-locality-only.test.sql. Everything rolls back.
begin;
do $$
declare
 owner_id uuid := gen_random_uuid();
 job_a uuid := gen_random_uuid();
 sweep_a int[]; sweep_b int[]; rows_a text[]; rows_b text[];
 r record; n int;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at) values(owner_id,owner_id||'@example.test','{}'::jsonb,now());
 insert into public.profiles(id,display_name,full_name,primary_role) values(owner_id,'Synthetic member','Synthetic member','both')
 on conflict(id) do update set full_name=excluded.full_name;
 -- Only synthetic fixtures count: hide any other rows in this disposable database.
 update public.jobs set visibility='invite_only' where visibility='public';
 -- A filled job whose requester hid the exact location (cell -36.7, 174.5).
 insert into public.jobs(id,requester_id,title,description,status,visibility,location_name,location_area,latitude,longitude,hide_exact_location,accepted_at,category)
 values(job_a,owner_id,'Filled fixture','Only a test','accepted','public','12 Kahikatea Road, Waitoki 0871, New Zealand','Waitoki',-36.654321,174.512345,true,now(),'Fencing & Gates');

 -- The distance helper is internal.
 if has_function_privilege('anon','public.filled_job_within(double precision,double precision,double precision,double precision,integer)','execute')
    or has_function_privilege('authenticated','public.filled_job_within(double precision,double precision,double precision,double precision,integer)','execute')
 then raise exception 'filled_job_within is callable by clients'; end if;

 set local role anon;
 -- Guests can use both functions; output is category, area and time only.
 select * into strict r from public.recently_filled_jobs();
 if r.area is distinct from 'Waitoki' or r.category is distinct from 'Fencing & Gates' or (to_jsonb(r) - 'category' - 'area' - 'filled_at') <> '{}'::jsonb
 then raise exception 'Unexpected filled-job output: %',to_jsonb(r); end if;
 if public.filled_jobs_count() <> 1 then raise exception 'Guest count without a location failed'; end if;

 -- Minimum radius: 0 and 1 km behave as 10 km around the job's grid point.
 if public.filled_jobs_count(-36.66,174.52,0) <> 1 or public.filled_jobs_count(-36.66,174.52,1) <> 1
 then raise exception 'Small radius not raised to 10 km'; end if;
 -- 0.4 km from the exact point but ~5 km from the grid point: still found with radius 1.
 if public.filled_jobs_count(-36.6507,174.5123,1) <> 1 then raise exception 'Exact position leaked through radius 1'; end if;
 -- ~22 km from the grid point: outside the 10 km floor.
 if public.filled_jobs_count(-36.5,174.5,1) <> 0 or exists(select 1 from public.recently_filled_jobs(-36.5,174.5,1))
 then raise exception 'Minimum radius larger than 10 km'; end if;

 -- Existing behaviour: 50 km "near you", null radius = 50 km, far away = none.
 if public.filled_jobs_count(-36.85,174.76,50) <> 1 or public.filled_jobs_count(-36.85,174.76,null) <> 1
    or not exists(select 1 from public.recently_filled_jobs(-36.85,174.76,50))
 then raise exception 'Nearby 50 km search lost the job'; end if;
 if public.filled_jobs_count(-41.29,174.78,50) <> 0 or exists(select 1 from public.recently_filled_jobs(-41.29,174.78,50))
 then raise exception 'Distant search returned the job'; end if;

 -- Inference: sweep probe centres across ~55 x 55 km at the 10 km minimum radius.
 select array_agg(public.filled_jobs_count(lat,lng,10) order by lat,lng),
        array_agg((select count(*)::text from public.recently_filled_jobs(lat,lng,10)) order by lat,lng)
   into sweep_a, rows_a
   from generate_series(-36.95,-36.45,0.02) lat, generate_series(174.2,174.8,0.03) lng;
 if not (1 = any(sweep_a) and 0 = any(sweep_a)) then raise exception 'Sweep does not cross the search edge'; end if;

 -- Move the job to a different point in the same grid cell (~5 km away):
 -- every probe must give the same answer, so probing cannot tell them apart.
 reset role;
 update public.jobs set latitude=-36.66,longitude=174.46 where id=job_a;
 set local role anon;
 select array_agg(public.filled_jobs_count(lat,lng,10) order by lat,lng),
        array_agg((select count(*)::text from public.recently_filled_jobs(lat,lng,10)) order by lat,lng)
   into sweep_b, rows_b
   from generate_series(-36.95,-36.45,0.02) lat, generate_series(174.2,174.8,0.03) lng;
 if sweep_a is distinct from sweep_b or rows_a is distinct from rows_b
 then raise exception 'Probes distinguish two positions in the same grid cell'; end if;

 -- Visibility rules are unchanged: invite-only and cancelled jobs are not counted.
 reset role;
 update public.jobs set visibility='invite_only' where id=job_a;
 set local role anon;
 if public.filled_jobs_count() <> 0 or exists(select 1 from public.recently_filled_jobs()) then raise exception 'Invite-only job counted'; end if;
 reset role;
 update public.jobs set visibility='public',status='cancelled' where id=job_a;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 if public.filled_jobs_count() <> 0 then raise exception 'Cancelled job counted'; end if;
 reset role;
end $$;
rollback;
