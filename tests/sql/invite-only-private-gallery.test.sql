begin;
do $$
declare
 actor uuid:=gen_random_uuid();
 provider uuid:=gen_random_uuid();
 draft uuid:=gen_random_uuid();
 photo uuid:=gen_random_uuid();
 other_photo uuid:=gen_random_uuid();
 bad_draft uuid:=gen_random_uuid();
 good_path text;
 extra_path text;
 digest text:=repeat('a',64);
 details jsonb:='{"title":"Synthetic gallery","description":"Synthetic gallery privacy test","category":"Fencing & Gates","price_type":"open","schedule_type":"flexible","hide_exact_location":true}';
 gallery jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[actor,provider]) u;
 insert into public.profiles(id,full_name,display_name,primary_role)
 select u,'Synthetic tester','Synthetic tester','both' from unnest(array[actor,provider]) u
 on conflict(id) do nothing;
 update public.job_primary_media_control set enabled=true where singleton;
 good_path:=public.reserve_job_primary_media(actor,draft,digest);
 extra_path:=public.reserve_job_draft_gallery_photo(actor,draft,photo,digest);
 insert into storage.objects(bucket_id,name) values('job-primary-media',good_path),('job-primary-media',extra_path);
 perform public.confirm_job_primary_upload(actor,draft,good_path,digest);
 perform public.confirm_job_primary_upload(actor,photo,extra_path,digest);
 gallery:=jsonb_build_array(jsonb_build_object('id',photo,'slot',1,'checksum',digest));
 begin
  perform public.publish_job_with_private_gallery(actor,draft,digest,details,provider,false,
   gallery||jsonb_build_array(jsonb_build_object('id',other_photo,'slot',2,'checksum',digest)));
  raise exception 'Invalid gallery published' using errcode='P9000';
 exception when raise_exception then null;
 end;
 if exists(select 1 from public.jobs where id=draft) then raise exception 'Job publication failed to roll back'; end if;
 perform public.publish_job_with_private_gallery(actor,draft,digest,details,provider,false,gallery);
 perform public.publish_job_with_private_gallery(actor,draft,digest,details,provider,false,gallery);
 if (select count(*) from public.job_primary_media where job_id=draft and state='published')<>2
 then raise exception 'Gallery was not published exactly once'; end if;

 set local role authenticated;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if public.legacy_job_photo_upload_allowed(actor||'/'||draft||'/photo.jpg')
    or public.legacy_job_photo_upload_allowed(draft||'/photo_thumb.jpg')
    or not public.legacy_job_photo_upload_allowed(actor||'/'||bad_draft||'/chat.jpg')
 then raise exception 'Public bucket path guard did not isolate the private job'; end if;
 begin
  insert into storage.objects(bucket_id,name) values('job-photos',actor||'/'||draft||'/photo.jpg');
  raise exception 'Client uploaded public photo to private job' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.create_invited_job(bad_draft,details||'{"photos":["https://example.test/public.jpg"]}'::jsonb,provider,false);
  raise exception 'Public attachment accepted in private job' using errcode='P9000';
 exception when raise_exception then null;
 end;
 begin
  update public.jobs set photos=array['https://example.test/public.jpg'] where id=draft;
  raise exception 'Direct update added public attachment' using errcode='P9000';
 exception when raise_exception then null;
 end;
 if (select count(*) from public.list_job_private_photos(draft))<>2 then raise exception 'Owner cannot see gallery'; end if;
 perform set_config('request.jwt.claim.sub',provider::text,true);
 if (select count(*) from public.list_job_private_photos(draft))<>2 then raise exception 'Active invitee cannot see gallery'; end if;
 perform public.respond_job_invitation((select id from public.job_invites where job_id=draft),1,'decline');
 if exists(select 1 from public.list_job_private_photos(draft)) then raise exception 'Declined invitee can see gallery'; end if;
 reset role;
end $$;
rollback;
