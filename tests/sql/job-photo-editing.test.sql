-- Run with both private photo migrations in an isolated database.
begin;
do $$
declare
  actor uuid:=gen_random_uuid();
  guest uuid:=gen_random_uuid();
  job uuid:=gen_random_uuid();
  other_job uuid:=gen_random_uuid();
  primary_id uuid:=gen_random_uuid();
  replacement uuid:=gen_random_uuid();
  extra_id uuid:=gen_random_uuid();
  hash text:=repeat('a',64);
  old_key text;
  new_key text;
  extra_key text;
  details jsonb:='{"title":"Synthetic photo edit","description":"Replace a gate hinge","category":"Fencing & Gates","price_type":"open","schedule_type":"flexible","photos":[],"materials_type":"none","hide_exact_location":true,"access_conditions":[]}';
  gallery jsonb;
  gallery_ids uuid[];
begin
  insert into auth.users(id,email,raw_user_meta_data,created_at)
    select u,u||'@example.test','{}'::jsonb,now() from unnest(array[actor,guest]) u;
  insert into public.profiles(id,display_name,full_name,primary_role)
    values(actor,'Photo requester','Photo requester','requester'),(guest,'Photo provider','Photo provider','provider')
    on conflict(id) do update set primary_role=excluded.primary_role;
  insert into public.jobs(id,requester_id,title,description,status,visibility) values
    (job,actor,'Synthetic photo job','Fix the gate hinge','open','invite_only'),
    (other_job,actor,'Synthetic public job','Test historical photos','open','public');
  update public.job_primary_media_control set enabled=true where singleton;
  old_key:=public.reserve_job_edit_photo(actor,job,primary_id,hash);
  if old_key is distinct from public.reserve_job_edit_photo(actor,job,primary_id,hash) then
    raise exception 'Retry generated another object'; end if;
  insert into storage.objects(bucket_id,name) values('job-primary-media',old_key);
  perform public.confirm_job_primary_upload(actor,primary_id,old_key,hash);
  gallery:=jsonb_build_array(jsonb_build_object('id',primary_id,'slot',0,'checksum',hash));
  begin
    perform public.publish_job_with_primary_media(actor,primary_id,hash,details);
    raise exception 'Edit stage was used to create a new job' using errcode='P9000';
  exception when raise_exception then null;
  end;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',guest::text,true);
  begin
    perform public.save_job_with_private_photos(job,details,'{}',gallery);
    raise exception 'Nonowner saved an edit' using errcode='P9000';
  exception when raise_exception then null;
  end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    perform public.save_job_with_private_photos(other_job,details,'{}',gallery);
    raise exception 'Stage was attached to a different job' using errcode='P9000';
  exception when raise_exception then null;
  end;
  perform public.save_job_with_private_photos(job,details,'{}',gallery);
  if (select count(*) from public.list_job_private_photos(job))<>1 then raise exception 'Owner gallery unavailable'; end if;
  reset role;

  new_key:=public.reserve_job_edit_photo(actor,job,replacement,hash);
  extra_key:=public.reserve_job_edit_photo(actor,job,extra_id,hash);
  insert into storage.objects(bucket_id,name) values('job-primary-media',new_key),('job-primary-media',extra_key);
  perform public.confirm_job_primary_upload(actor,replacement,new_key,hash);
  gallery:=jsonb_build_array(jsonb_build_object('id',replacement,'slot',0,'checksum',hash),
                            jsonb_build_object('id',extra_id,'slot',1,'checksum',hash));
  set local role authenticated;
  begin
    perform public.save_job_with_private_photos(job,details||'{"title":"Should roll back"}',array[primary_id],gallery);
    raise exception 'Unconfirmed stage was saved' using errcode='P9000';
  exception when raise_exception then null;
  end;
  reset role;
  if public.read_job_primary_media(job,actor) is distinct from old_key or
    (select title from public.jobs where id=job)<>'Synthetic photo edit' then raise exception 'Failed save replaced current job'; end if;
  perform public.confirm_job_primary_upload(actor,extra_id,extra_key,hash);
  set local role authenticated;
  perform public.save_job_with_private_photos(job,details,array[primary_id],gallery);
  perform public.save_job_with_private_photos(job,details,array[primary_id],gallery);
  perform set_config('request.jwt.claim.sub',guest::text,true);
  if exists(select 1 from public.list_job_private_photos(job)) then raise exception 'Private gallery leaked to unrelated account'; end if;
  reset role;
  if public.read_job_gallery_photo(job,null,extra_id) is not null then raise exception 'Guest fetched private image'; end if;
  insert into public.job_invites(job_id,requester_id,provider_id) values(job,actor,guest);
  if public.read_job_gallery_photo(job,guest,extra_id) is distinct from extra_key then raise exception 'Invitee image read failed'; end if;
  if public.read_job_primary_media(job,actor) is distinct from new_key then raise exception 'Replacement unavailable'; end if;
  if public.read_job_gallery_photo(job,actor,primary_id) is not null then raise exception 'Old private image remains readable'; end if;
  old_key:=public.reserve_job_edit_photo(actor,other_job,gen_random_uuid(),hash);
  select draft_id into primary_id from public.job_primary_media where object_key=old_key;
  insert into storage.objects(bucket_id,name) values('job-primary-media',old_key);
  perform public.confirm_job_primary_upload(actor,primary_id,old_key,hash);
  update public.jobs set photos=array['https://fixture.test/legacy.jpg'] where id=other_job;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.save_job_with_private_photos(other_job,details||'{"photos":["https://fixture.test/legacy.jpg"]}',
    '{}',jsonb_build_array(jsonb_build_object('id',primary_id,'slot',0,'checksum',hash)));
  select coalesce(array_agg(id order by id),'{}') into gallery_ids from public.list_job_private_photos(job);
  perform public.save_job_with_private_photos(job,details,gallery_ids,'[]');
  reset role;
  if public.read_job_primary_media(other_job,null) is distinct from old_key or
     (select photos from public.jobs where id=other_job) is distinct from array['https://fixture.test/legacy.jpg']
  then raise exception 'Public media or legacy photo lost'; end if;
  if public.read_job_primary_media(job,actor) is not null then raise exception 'Removed primary resolved'; end if;
  if (select count(*) from public.job_primary_media where edit_job_id=job and state='deleting' and job_id is null)<>3 then
    raise exception 'Replaced or removed objects did not enter cleanup'; end if;
  begin
    update public.jobs set visibility='public' where id=job;
    raise exception 'Deleting photos allowed visibility changes' using errcode='P9000';
  exception when raise_exception then null;
  end;
  update public.jobs set status='completed' where id=job;
  set local role authenticated;
  begin
    perform public.save_job_with_private_photos(job,details,'{}','[]');
    raise exception 'Completed job accepted edit' using errcode='P9000';
  exception when raise_exception then null;
  end;
  reset role;
end $$;
rollback;
