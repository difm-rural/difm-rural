-- Editing a private job in the app: save_job_with_private_photos with the job's own
-- values, then the traced area as a separate owner update. Run in an isolated database.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),
  set_config('test.job',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at)
  select u::uuid,u||'@example.test','{}'::jsonb,now() from unnest(array[current_setting('test.owner'),current_setting('test.other')]) u;
insert into public.profiles(id,display_name,full_name,primary_role)
  select u::uuid,'Edit tester','Edit tester','requester' from unnest(array[current_setting('test.owner'),current_setting('test.other')]) u
  on conflict(id) do nothing;
insert into public.jobs(id,requester_id,title,description,category,status,visibility,price_type,price,location_name,location_area,location_note,
  hide_exact_location,latitude,longitude,schedule_type,scheduled_date,materials_type,access_conditions,photos,area_polygon,area_hectares,recurrence_frequency)
values(current_setting('test.job')::uuid,current_setting('test.owner')::uuid,'Fix the fence','Two posts','Fencing & Gates','open','invite_only','fixed',250.5,
  '165 Ireland Road, Waitoki','Near Waitoki','Second gate',true,-36.51,174.52,'specific','2099-03-01T11:00:00+00:00','provider',
  array['4wd_required','dogs_on_property'],'{}','[{"latitude":-36.5,"longitude":174.5}]',12.3,'weekly');
create temp table before_edit on commit drop as select to_jsonb(j) as row from public.jobs j where id=current_setting('test.job')::uuid;
grant select on before_edit to authenticated;

select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare
  job uuid:=current_setting('test.job')::uuid;
  original jsonb:=(select row from before_edit);
  now_row jsonb;
  n integer;
begin
  -- An untouched edit changes nothing.
  perform public.save_job_with_private_photos(job,original||'{"photos":[]}','{}','[]');
  select to_jsonb(j) into now_row from public.jobs j where id=job;
  if now_row is distinct from original then raise exception 'Untouched private edit changed the job: % to %',original,now_row; end if;

  -- A new trace is not part of that save, so the app writes it after.
  perform public.save_job_with_private_photos(job,original||'{"photos":[],"title":"New title","area_polygon":[{"latitude":-37,"longitude":175}]}','{}','[]');
  update public.jobs set area_polygon='[{"latitude":-37,"longitude":175}]',area_hectares=1.5 where id=job and requester_id=auth.uid() and status='open';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Owner could not save the traced area'; end if;
  select to_jsonb(j) into now_row from public.jobs j where id=job;
  if now_row is distinct from original||'{"title":"New title","area_polygon":[{"latitude":-37,"longitude":175}],"area_hectares":1.5}'
    then raise exception 'Tracing changed something else: %',now_row; end if;

  -- Moving the job clears the area in that save; the app then writes back the one it kept.
  perform public.save_job_with_private_photos(job,now_row||'{"photos":[],"latitude":-38}','{}','[]');
  if (select area_polygon from public.jobs where id=job) is not null then raise exception 'Expected the move to clear the area'; end if;
  update public.jobs set area_polygon=now_row->'area_polygon',area_hectares=1.5 where id=job and requester_id=auth.uid() and status='open';
  select to_jsonb(j) into now_row from public.jobs j where id=job;
  if now_row->'area_polygon' is distinct from '[{"latitude":-37,"longitude":175}]' then raise exception 'Area was not kept'; end if;
  if (select count(*) from public.jobs where requester_id=auth.uid())<>1 then raise exception 'An edit created another job'; end if;
end $$;
reset role;

-- Nobody else can write it.
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
set local role authenticated;
do $$
declare n integer;
begin
  update public.jobs set area_polygon=null where id=current_setting('test.job')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Another member changed the area'; end if;
end $$;
reset role;
rollback;
