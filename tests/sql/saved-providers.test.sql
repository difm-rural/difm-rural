begin;
do $$
declare
 saver uuid:=gen_random_uuid();
 provider uuid:=gen_random_uuid();
 stranger uuid:=gen_random_uuid();
 fixture_job uuid:=gen_random_uuid();
 finished_job uuid:=gen_random_uuid();
 next_job uuid:=gen_random_uuid();
 before_save bigint;
 affected int;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[saver,provider,stranger]) u;
 insert into public.profiles(id,full_name,display_name,primary_role)
 select u,'Synthetic member','Synthetic member','both' from unnest(array[saver,provider,stranger]) u
 on conflict(id) do nothing;
 insert into public.jobs(id,requester_id,title,description,status,visibility)
 values(fixture_job,saver,'Bookmark fixture','Synthetic job','open','invite_only');
 select count(*) into before_save from public.notifications where user_id=provider;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',saver::text,true);
 insert into public.saved_providers(requester_id,provider_id) values(saver,provider);
 begin
  insert into public.saved_providers(requester_id,provider_id) values(saver,provider);
  raise exception 'Duplicate save inserted' using errcode='P9000';
 exception when unique_violation then null;
 end;
 begin
  insert into public.saved_providers(requester_id,provider_id) values(stranger,provider);
  raise exception 'Saved on behalf of another user' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.saved_providers where requester_id=saver)<>1
 then raise exception 'Owner cannot see bookmark'; end if;
 reset role;
 if (select count(*) from public.notifications where user_id=provider)<>before_save
 then raise exception 'Saving triggered a notification'; end if;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',provider::text,true);
 if exists(select 1 from public.saved_providers) then raise exception 'Provider can see who saved them'; end if;
 if exists(select 1 from public.jobs_public where id=fixture_job) then raise exception 'Bookmark granted private job access'; end if;
 if exists(select 1 from public.connections where requester_id=saver and provider_id=provider)
 then raise exception 'Bookmark created a completed relationship'; end if;
 delete from public.saved_providers where requester_id=saver;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Provider removed another user bookmark'; end if;

 perform set_config('request.jwt.claim.sub',saver::text,true);
 perform public.invite_connection_to_job(fixture_job,provider);
 perform public.invite_connection_to_job(fixture_job,provider);
 if (select count(*) from public.job_invites where job_id=fixture_job)<>1
 then raise exception 'Duplicate active invitation'; end if;
 delete from public.saved_providers where requester_id=saver and provider_id=provider;
 if exists(select 1 from public.saved_providers where requester_id=saver)
 then raise exception 'Owner could not unsave'; end if;
 perform set_config('request.jwt.claim.sub',provider::text,true);
 if not exists(select 1 from public.jobs_public where id=fixture_job)
 then raise exception 'Unsave revoked an independent invitation'; end if;
 reset role;
 -- Completed work stays independent and the same provider may occupy both sections.
 insert into public.jobs(id,requester_id,title,description,status,visibility)
 values(finished_job,saver,'Completed fixture','Test history','completed','public'),
       (next_job,saver,'New fixture','Test invitation','open','public');
 insert into public.bids(job_id,provider_id,status,amount) values(finished_job,provider,'accepted',100);
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',saver::text,true);
 insert into public.saved_providers(requester_id,provider_id) values(saver,provider);
 if not exists(select 1 from public.connections where requester_id=saver and provider_id=provider)
    or not exists(select 1 from public.saved_providers where requester_id=saver and provider_id=provider)
 then raise exception 'Expected independent completed-work and saved records'; end if;
 perform public.invite_connection_to_job(next_job,provider);
 if not exists(select 1 from public.job_invites where job_id=next_job and provider_id=provider)
 then raise exception 'Previous provider invitation was not created'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 set local role anon;
 if not exists(select 1 from public.profiles_public where id=provider)
 then raise exception 'Public profile is not guest-readable'; end if;
 begin
  perform 1 from public.saved_providers;
  raise exception 'Guest can access bookmarks' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
