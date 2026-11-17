-- Synthetic fixtures in isolated PostgreSQL/Supabase. Storage metadata is a shim.
begin;
create function pg_temp.reject_photo_fixture_invite() returns trigger language plpgsql as $$
begin
  raise exception 'Synthetic invite write failure' using errcode='P9001';
end $$;
do $$
declare
  owner_id uuid := gen_random_uuid();
  provider_id uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  anchor uuid := gen_random_uuid();
  draft uuid := gen_random_uuid();
  staged uuid := gen_random_uuid();
  public_draft uuid := gen_random_uuid();
  text_job uuid := gen_random_uuid();
  winning_bid uuid := gen_random_uuid();
  hash text := repeat('a',64);
  photo_key text;
  staged_key text;
  public_key text;
  lease uuid;
  replacement uuid;
  details jsonb := '{"title":"Synthetic fence repair","description":"Replace two hinges","category":"Fencing & Gates","price_type":"open","schedule_type":"flexible"}';
begin
  insert into auth.users(id,email,raw_user_meta_data,created_at)
  select u,u||'@example.test','{}'::jsonb,now() from unnest(array[owner_id,provider_id,outsider]) u;
  insert into public.profiles(id,display_name,full_name,primary_role) values
    (owner_id,'Fixture requester','Fixture requester','requester'),
    (provider_id,'Fixture provider','Fixture provider','provider'),
    (outsider,'Fixture outsider','Fixture outsider','provider')
  on conflict(id) do update set display_name=excluded.display_name,full_name=excluded.full_name;
  if (select enabled from public.job_primary_media_control) then raise exception 'Gate defaulted on'; end if;
  begin
    perform public.reserve_job_primary_media(owner_id,draft,hash);
    raise exception 'Disabled reservation succeeded' using errcode='P9000';
  exception when raise_exception then null;
  end;
  update public.job_primary_media_control set enabled=true;
  photo_key:=public.reserve_job_primary_media(owner_id,draft,hash);
  insert into storage.objects(bucket_id,name) values('job-primary-media',photo_key);
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,hash,details);
    raise exception 'Unconfirmed upload published' using errcode='P9000';
  exception when raise_exception then null;
  end;
  if public.confirm_job_primary_upload(outsider,draft,photo_key,hash)
    or not public.confirm_job_primary_upload(owner_id,draft,photo_key,hash)
    or public.read_job_primary_media(draft,owner_id) is not null then
    raise exception 'Upload ownership, confirmation or staged privacy failed';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,hash,details);
    raise exception 'Direct authenticated publication succeeded';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update public.job_primary_media_control set enabled=false;
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,hash,details);
    raise exception 'Disabled publication succeeded' using errcode='P9000';
  exception when raise_exception then null;
  end;
  -- A completed engagement makes the provider eligible for the existing invitation RPC.
  insert into public.jobs(id,requester_id,title,description,status)
    values(anchor,owner_id,'Historical fixture','Synthetic completed work','completed');
  insert into public.bids(job_id,provider_id,amount,status) values(anchor,provider_id,100,'accepted');
  update public.job_primary_media_control set enabled=true;
  begin
    perform public.publish_job_with_primary_media(outsider,draft,hash,details);
    raise exception 'Cross-owner publication succeeded' using errcode='P9000';
  exception when raise_exception then null;
  end;
  create trigger photo_fixture_invite_failure before insert on public.job_invites
    for each row execute function pg_temp.reject_photo_fixture_invite();
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,hash,details,provider_id,false);
    raise exception 'Publication survived a failed invite insert';
  exception when sqlstate 'P9001' then null;
  end;
  drop trigger photo_fixture_invite_failure on public.job_invites;
  if exists(select 1 from public.jobs where id=draft)
    or not exists(select 1 from public.job_primary_media where draft_id=draft and state='staged' and job_id is null)
    then raise exception 'Failed invite left a partial publication'; end if;
  set local role service_role;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,hash,details,outsider,false);
    raise exception 'Unconnected provider was invited' using errcode='P9000';
  exception when raise_exception then null;
  end;
  if public.publish_job_with_primary_media(owner_id,draft,hash,details,provider_id,false) is distinct from draft
     or public.publish_job_with_primary_media(owner_id,draft,hash,details,provider_id,false) is distinct from draft
  then raise exception 'Publication did not commit idempotently'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if (select count(*) from public.job_invites where job_id=draft)<>1
     or public.read_job_primary_media(draft,provider_id) is distinct from photo_key
     or public.read_job_primary_media(draft,owner_id) is distinct from photo_key
     or public.read_job_primary_media(draft,outsider) is not null
     or public.read_job_primary_media(draft,null) is not null
  then raise exception 'Invite publication or image access failed'; end if;
  begin
    perform public.publish_job_with_primary_media(owner_id,draft,repeat('b',64),details);
    raise exception 'Published media accepted a different checksum' using errcode='P9000';
  exception when raise_exception then null;
  end;
  begin
    update public.jobs set visibility='public' where id=draft;
    raise exception 'Privileged audience change succeeded' using errcode='P9000';
  exception when raise_exception then null;
  end;
  begin
    update public.jobs set photos=array['https://fixture.test/legacy.jpg'] where id=draft;
    raise exception 'Public photo attachment succeeded' using errcode='P9000';
  exception when raise_exception then null;
  end;
  set local role authenticated;
  begin
    update public.jobs set visibility='public' where id=draft;
    raise exception 'Requester changed published V1 audience' using errcode='P9000';
  exception when raise_exception then null;
  end;
  insert into public.jobs(id,requester_id,title,description,status)
    values(text_job,owner_id,'Manual fixture','Text-only work','open');
  update public.jobs set visibility='invite_only' where id=text_job;
  update public.jobs set status='cancelled' where id=text_job;
  if not found then raise exception 'Legacy requester cancellation failed'; end if;
  reset role;
  insert into public.bids(id,job_id,provider_id,amount,status) values(winning_bid,draft,provider_id,100,'accepted');
  update public.jobs set status='accepted' where id=draft;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  update public.jobs set visibility='public' where id=draft;
  if found then raise exception 'Unrelated actor updated the job'; end if;
  perform set_config('request.jwt.claim.sub',provider_id::text,true);
  begin
    update public.jobs set status='completed',visibility='public' where id=draft;
    raise exception 'Provider changed the job audience during completion' using errcode='P9000';
  exception when raise_exception then null;
  end;
  begin
    update public.jobs set status='completed',requester_id=provider_id where id=draft;
    raise exception 'Provider took ownership during completion' using errcode='P9000';
  exception when raise_exception then null;
  end;
  update public.jobs set status='completed' where id=draft;
  if not found then raise exception 'Ordinary provider completion failed'; end if;
  perform public.mark_job_payment_sorted(winning_bid,false);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.mark_job_payment_sorted(winning_bid,true);
  insert into public.reviews(job_id,reviewer_id,reviewee_id,reviewer_role,reviewee_role,rating)
    values(draft,owner_id,provider_id,'requester','provider',5);
  reset role;
  if public.read_job_primary_media(draft,null) is not null then raise exception 'Completion made photo public'; end if;

  public_key:=public.reserve_job_primary_media(owner_id,public_draft,hash);
  insert into storage.objects(bucket_id,name) values('job-primary-media',public_key);
  if not public.confirm_job_primary_upload(owner_id,public_draft,public_key,hash)
     then raise exception 'Public media upload confirmation failed'; end if;
  if public.publish_job_with_primary_media(owner_id,public_draft,hash,details) is distinct from public_draft
     then raise exception 'Public media publication failed'; end if;
  if public.read_job_primary_media(public_draft,null) is distinct from public_key
     then raise exception 'Public media read failed'; end if;
  set local role authenticated;
  update public.jobs set status='cancelled' where id=public_draft;
  if not found then raise exception 'Ordinary requester cancellation failed'; end if;
  reset role;
  if public.read_job_primary_media(public_draft,null) is not null
     or public.read_job_primary_media(public_draft,owner_id) is distinct from public_key
     then raise exception 'Cancelled job media access failed'; end if;

  staged_key:=public.reserve_job_primary_media(owner_id,staged,hash);
  insert into storage.objects(bucket_id,name) values('job-primary-media',staged_key);
  if not public.confirm_job_primary_upload(owner_id,staged,staged_key,hash) then raise exception 'Staging failed'; end if;
  update public.job_primary_media set expires_at=now()-interval '1 second' where draft_id=staged;
  begin
    perform public.publish_job_with_primary_media(owner_id,staged,hash,details);
    raise exception 'Expired stage published' using errcode='P9000';
  exception when raise_exception then null;
  end;
  select lease_token into lease from public.claim_job_media_cleanup() where object_key=staged_key;
  if lease is null or exists(select 1 from public.claim_job_media_cleanup())
    then raise exception 'Active lease was reclaimed or attached media was claimed'; end if;
  update public.job_primary_media set expires_at=now()-interval '1 second' where draft_id=staged;
  if public.finish_job_media_cleanup(staged_key,lease) then raise exception 'Expired lease finalised'; end if;
  select lease_token into replacement from public.claim_job_media_cleanup() where object_key=staged_key;
  if replacement is null or replacement=lease or public.finish_job_media_cleanup(staged_key,replacement)
    then raise exception 'Reclaim or Storage presence check failed'; end if;
  delete from storage.objects where bucket_id='job-primary-media' and name=staged_key;
  if public.finish_job_media_cleanup(staged_key,lease)
    or not public.finish_job_media_cleanup(staged_key,replacement)
    or public.finish_job_media_cleanup(staged_key,replacement)
    then raise exception 'Stale lease fencing or cleanup retry failed'; end if;
  delete from public.job_invites where job_id=draft;
  if public.read_job_primary_media(draft,provider_id) is not null then raise exception 'Removed invite retained access'; end if;
  delete from public.jobs where id=draft;
  if public.read_job_primary_media(draft,owner_id) is not null
    or not exists(select 1 from public.claim_job_media_cleanup() where object_key=photo_key)
    then raise exception 'Deleted job media remained readable or was not claimed'; end if;
  if has_function_privilege('anon','public.publish_job_with_primary_media(uuid,uuid,text,jsonb,uuid,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.confirm_job_primary_upload(uuid,uuid,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.read_job_primary_media(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_job_media_cleanup()','EXECUTE')
    or has_table_privilege('authenticated','public.job_primary_media','SELECT')
    or has_table_privilege('service_role','public.job_primary_media_control','UPDATE')
    then raise exception 'Unexpected privilege'; end if;
end $$;
rollback;
