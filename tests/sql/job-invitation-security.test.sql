-- Replay after the Stage 2 migration in isolated PostgreSQL only.
begin;
do $$
declare
 owner_id uuid := gen_random_uuid();
 provider_id uuid := gen_random_uuid();
 outsider_id uuid := gen_random_uuid();
 private_job uuid := gen_random_uuid();
 public_job uuid := gen_random_uuid();
 invitation uuid;
 offer_id uuid := gen_random_uuid();
 changed integer;
 image_id uuid := gen_random_uuid();
 image_key text;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[owner_id,provider_id,outsider_id]) u;
 insert into public.profiles(id,display_name,full_name,primary_role)
 select u,'Synthetic member','Synthetic member','both' from unnest(array[owner_id,provider_id,outsider_id]) u
 on conflict(id) do update set full_name=excluded.full_name;
 insert into public.jobs(id,requester_id,title,description,status,visibility,latitude,longitude,hide_exact_location)
 values (private_job,owner_id,'Private fixture','Only a test','open','invite_only',-37,175,true),
        (public_job,owner_id,'Public fixture','Only a test','open','public',-37,175,true);

 update public.job_primary_media_control set enabled=true where singleton;
 image_key:=public.reserve_job_edit_photo(owner_id,private_job,image_id,repeat('a',64));
 insert into storage.objects(bucket_id,name) values('job-primary-media',image_key);
 perform public.confirm_job_primary_upload(owner_id,image_id,image_key,repeat('a',64));

 set local role authenticated;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 if not exists(select 1 from public.jobs j where j.id=private_job and j.latitude=-37) then raise exception 'Owner lost location access'; end if;
 perform public.save_job_with_private_photos(private_job,
  '{"title":"Private fixture","description":"Only a test","category":"Fencing & Gates","price_type":"open","schedule_type":"flexible","latitude":-37,"longitude":175,"hide_exact_location":true,"materials_type":"none","access_conditions":[]}',
  '{}',jsonb_build_array(jsonb_build_object('id',image_id,'slot',0,'checksum',repeat('a',64))));
 if (select count(*) from public.list_job_private_photos(private_job))<>1 then raise exception 'Owner lost photo access'; end if;
 perform public.invite_connection_to_job(private_job,provider_id);
 perform public.invite_connection_to_job(private_job,provider_id);
 select i.id into strict invitation from public.job_invites i where i.job_id=private_job and i.revision=1;

 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 begin
  update public.jobs_public j set title='Unexpected write' where j.id=public_job;
  raise exception 'Masked view grants writes' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.jobs j where j.id in (private_job,public_job))
    or exists(select 1 from public.jobs_public j where j.id=private_job)
    or not exists(select 1 from public.jobs_public j where j.id=public_job and j.latitude is null)
 then raise exception 'Unrelated provider access is incorrect'; end if;
 begin
  insert into public.bids(id,job_id,provider_id,status,amount) values(offer_id,public_job,outsider_id,'accepted',100);
  raise exception 'Forged acceptance allowed' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.respond_job_invitation(invitation,1,'accept');
  raise exception 'Unrelated user accepted invitation' using errcode='P9000';
 exception when raise_exception then null;
 end;

 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 if exists(select 1 from public.jobs j where j.id=private_job)
    or not exists(select 1 from public.jobs_public j where j.id=private_job and j.latitude is null)
 then raise exception 'Pending invite should grant only masked access'; end if;
 if (select count(*) from public.list_job_private_photos(private_job))<>1 then raise exception 'Pending invitee lost photo access'; end if;
 begin
  update public.job_invites i set status='accepted' where i.id=invitation;
  raise exception 'Direct invitation update allowed' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 perform public.respond_job_invitation(invitation,1,'view');
 perform public.respond_job_invitation(invitation,1,'accept');
 if exists(select 1 from public.bids b where b.job_id=private_job) then raise exception 'Invitation acceptance created a bid'; end if;
 insert into public.bids(id,job_id,provider_id,status,amount) values(offer_id,private_job,provider_id,'pending',100);
 begin
  update public.bids b set status='accepted' where b.id=offer_id;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Provider accepted own bid' using errcode='P9000'; end if;
 exception when raise_exception or insufficient_privilege then null;
 end;
 perform public.respond_job_invitation(invitation,1,'decline');
 if exists(select 1 from public.jobs_public j where j.id=private_job)
    or exists(select 1 from public.jobs j where j.id=private_job)
 then raise exception 'Declined invitation grants access'; end if;
 if exists(select 1 from public.list_job_private_photos(private_job)) then raise exception 'Declined invitation grants photo access'; end if;

 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.reinvite_to_job(private_job,provider_id,1);
 perform public.respond_job_invitation(invitation,2,'withdraw');
 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 if exists(select 1 from public.jobs_public j where j.id=private_job) then raise exception 'Withdrawn invitation grants access'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.reinvite_to_job(private_job,provider_id,2);
 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 begin
  perform public.respond_job_invitation(invitation,2,'decline');
  raise exception 'Stale invitation revision succeeded' using errcode='P9000';
 exception when raise_exception then null;
 end;
 perform public.respond_job_invitation(invitation,3,'decline');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  update public.jobs set status='accepted' where id=private_job;
  update public.bids set status='accepted' where id=offer_id;
  raise exception 'Raw requester update bypassed atomic acceptance' using errcode='P9000';
 exception when raise_exception or insufficient_privilege then null;
 end;
 perform public.accept_job_offer(offer_id);
 perform set_config('request.jwt.claim.sub',provider_id::text,true);
 if not exists(select 1 from public.jobs j where j.id=private_job and j.latitude=-37)
 then raise exception 'Awarded provider lost exact location'; end if;
 if (select count(*) from public.list_job_private_photos(private_job))<>1 then raise exception 'Awarded provider lost photo access'; end if;
 perform public.confirm_job(offer_id,statement_timestamp()+interval '8 days 45 minutes','agreed','',null);
 update public.jobs j set status='completed' where j.id=private_job;
 if not exists(select 1 from public.jobs j where j.id=private_job and j.status='completed' and j.visibility='invite_only')
 then raise exception 'Provider completion failed or changed visibility'; end if;
 if (select count(*) from public.list_job_private_photos(private_job))<>1 then raise exception 'Completed job photo lost for awarded provider'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 set local role anon;
 if exists(select 1 from public.jobs_public j where j.id=private_job)
    or not exists(select 1 from public.jobs_public j where j.id=public_job and j.latitude is null)
 then raise exception 'Guest visibility is incorrect'; end if;
 reset role;
end $$;
rollback;
