begin;
do $$
declare
 owner_id uuid:=gen_random_uuid();
 local_id uuid:=gen_random_uuid();
 second_id uuid:=gen_random_uuid();
 outsider_id uuid:=gen_random_uuid();
 fixture_job uuid:=gen_random_uuid();
 key text:='custom-'||gen_random_uuid();
 changed int;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[owner_id,local_id,second_id,outsider_id]) u;
 insert into public.profiles(id,full_name,display_name,primary_role)
 select u,'Synthetic member','Synthetic member','both' from unnest(array[owner_id,local_id,second_id,outsider_id]) u
 on conflict(id) do nothing;
 insert into public.jobs(id,requester_id,title,description,status,visibility)
 values(fixture_job,owner_id,'Network fixture','Synthetic job','open','invite_only');
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.property_network_areas values(owner_id,'trees',true);
 insert into public.property_network_services values(owner_id,'trees',key,'Check tōtara','needs_help');
 update public.property_network_services set status='self' where service_key=key;
 if not exists(select 1 from public.property_network_services where service_key=key and status='self')
 then raise exception 'Owner could not set service status'; end if;

 perform public.link_property_network_provider('trees',key,'Check tōtara',local_id);
 perform public.link_property_network_provider('trees',key,'Check tōtara',second_id);
 perform public.link_property_network_provider('trees',key,'Check tōtara',local_id);
 if (select count(*) from public.property_network_providers where service_key=key)<>2
 then raise exception 'Provider links are not unique or do not support multiple providers'; end if;
 if not exists(select 1 from public.property_network_services where service_key=key and status='has_provider')
 then raise exception 'Linking did not set the service status'; end if;
 begin
  perform public.link_property_network_provider('water','suggested-1','Water delivery',gen_random_uuid());
  raise exception 'Linked a nonexistent provider' using errcode='P9000';
 exception when insufficient_privilege or foreign_key_violation then null;
 end;
 if exists(select 1 from public.property_network_services where area='water')
 then raise exception 'A failed link left behind a suggested service'; end if;
 begin
  insert into public.property_network_areas values(outsider_id,'water',true);
  raise exception 'Can create another user''s area' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 update public.property_network_areas set active=false where area='trees';
 if (select count(*) from public.property_network_providers where service_key=key)<>2
 then raise exception 'Hiding area deleted links'; end if;
 update public.property_network_areas set active=true where area='trees';
 if not exists(select 1 from public.property_network_areas where area='trees' and active)
 then raise exception 'Cannot re-add area'; end if;
 reset role;

 if exists(select 1 from public.notifications where user_id in (local_id,second_id,outsider_id))
    or exists(select 1 from public.saved_providers where requester_id=owner_id)
 then raise exception 'Linking sent a notification or created a bookmark'; end if;

 set local role authenticated;
 perform set_config('request.jwt.claim.sub',local_id::text,true);
 if exists(select 1 from public.property_network_areas)
    or exists(select 1 from public.property_network_services)
    or exists(select 1 from public.property_network_providers)
 then raise exception 'A linked provider can see the network'; end if;
 if exists(select 1 from public.jobs_public where id=fixture_job)
 then raise exception 'Linking granted private job access'; end if;
 delete from public.property_network_providers where service_key=key;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Provider deleted another owner''s links'; end if;

 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.invite_connection_to_job(fixture_job,local_id);
 perform public.invite_connection_to_job(fixture_job,local_id);
 if (select count(*) from public.job_invites where job_id=fixture_job)<>1
 then raise exception 'Existing invitation controls failed'; end if;
 delete from public.property_network_providers where service_key=key and provider_id=local_id;
 if (select count(*) from public.property_network_providers where service_key=key)<>1
 then raise exception 'Unlinking changed another provider'; end if;
 perform set_config('request.jwt.claim.sub',local_id::text,true);
 if not exists(select 1 from public.jobs_public where id=fixture_job)
 then raise exception 'Unlinking removed independently granted invitation access'; end if;
 reset role;
 set local role anon;
 begin
  perform 1 from public.property_network_services;
  raise exception 'Guest read a private network' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
