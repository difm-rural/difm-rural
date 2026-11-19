begin;
do $$
declare
 owner uuid:=gen_random_uuid();
 provider uuid:=gen_random_uuid();
 fixture jsonb:='{"name":"Private fixture","propertyType":"Farm","areaHa":"0.93","paddocks":"2","water":"Rainwater","livestock":"Sheep","surface":"Gravel",
 "camera":{"latitude":-41.2,"longitude":173.8,"zoom":17},"pin":{"latitude":-41.2,"longitude":173.8},
 "boundary":[{"latitude":-41.2,"longitude":173.8},{"latitude":-41.199,"longitude":173.8},{"latitude":-41.2,"longitude":173.801}],
 "features":[{"id":"00000000-0000-4000-8000-000000000001","kind":"driveway","name":"","points":[{"latitude":-41.2,"longitude":173.8},{"latitude":-41.199,"longitude":173.8}]}]}';
 affected integer;
 routine record;
begin
 insert into auth.users(id,email,raw_user_meta_data,created_at)
 select u,u||'@example.test','{}'::jsonb,now() from unnest(array[owner,provider]) u;
 insert into public.profiles(id,full_name,display_name,primary_role)
 select u,'Synthetic user','Synthetic user','both' from unnest(array[owner,provider]) u on conflict(id) do nothing;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 insert into public.private_property_maps values(owner,fixture,1);
 if not exists(select from public.private_property_maps where owner_id=owner and revision=1)
 then raise exception 'Owner cannot read private property'; end if;
 if exists(select from public.property_network_areas where owner_id=owner)
 then raise exception 'Saving the property changed support areas'; end if;
 insert into public.property_network_areas values(owner,'water',true);
 if not exists(select from public.property_network_areas where owner_id=owner and area='water')
 then raise exception 'Owner lost access to Property Network'; end if;
 update public.private_property_maps set profile=jsonb_set(profile,'{features}','[]'),revision=2 where owner_id=owner;
 if not exists(select from public.private_property_maps where owner_id=owner and profile->'features'='[]'::jsonb)
 then raise exception 'Owner could not remove features'; end if;
 update public.private_property_maps set profile=fixture,revision=3 where owner_id=owner;
 update public.private_property_maps set profile=jsonb_set(profile,'{boundary}',
  '[{"latitude":-41.2,"longitude":173.8},{"latitude":-41.198,"longitude":173.8},{"latitude":-41.2,"longitude":173.802}]'),revision=4 where owner_id=owner;
 if not exists(select from public.private_property_maps where owner_id=owner and revision=4 and profile->'boundary'<>fixture->'boundary')
 then raise exception 'Owner could not update boundary'; end if;
 -- An assistant uses the same role and owner subject; only client_id differs.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','client_id','map-regression')::text,true);
 if not exists(select from public.private_property_maps where owner_id=owner)
 then raise exception 'Read-only assistant cannot read owner map'; end if;
 update public.private_property_maps set revision=99 where owner_id=owner;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Assistant updated private map'; end if;
 begin
  delete from public.private_property_maps where owner_id=owner;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Assistant deleted private map'; end if;
 exception when insufficient_privilege then null;
 end;
 reset role;
 -- Remove only this transaction's fixture so INSERT tests owner identity too.
 delete from public.private_property_maps where owner_id=owner;
 set local role authenticated;
 begin
  insert into public.private_property_maps values(owner,fixture,1);
  raise exception 'Assistant inserted private map' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 -- A security-invoker RPC cannot turn an assistant into an owner writer.
 begin
  perform public.link_property_network_provider('water','suggested-1','Water delivery',provider);
  raise exception 'Assistant bypassed write restrictions through RPC' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 reset role;
 -- No callable SECURITY DEFINER routine may reference the map table. The
 -- map validators are immutable invoker functions, not privileged write RPCs.
 for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.prosrc ilike '%private_property_maps%'
   and has_function_privilege('authenticated',p.oid,'EXECUTE') loop
  raise exception 'Callable privileged map RPC needs review: %',routine.signature;
 end loop;
 perform set_config('request.jwt.claims','{}',true);
 set local role authenticated;
 insert into public.private_property_maps values(owner,fixture,5);
 begin
  update public.private_property_maps set profile=jsonb_set(profile,'{boundary}','[{"latitude":-41.2,"longitude":173.8}]');
  raise exception 'Incomplete boundary persisted' using errcode='P9000';
 exception when check_violation then null;
 end;
 begin
  update public.private_property_maps set profile=jsonb_set(profile,'{pin}','{"latitude":180,"longitude":173.8}');
  raise exception 'Invalid coordinates persisted' using errcode='P9000';
 exception when check_violation then null;
 end;
 begin
  insert into public.private_property_maps values(provider,fixture,1);
  raise exception 'Owner created a map on another account' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',provider::text,true);
 if exists(select from public.private_property_maps) then raise exception 'Provider can see another property'; end if;
 update public.private_property_maps set revision=99 where owner_id=owner;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Provider changed another property'; end if;
 begin
  insert into public.private_property_maps values(owner,fixture,99);
  raise exception 'Unrelated user inserted owner map' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 reset role;
 set local role anon;
 begin
  perform 1 from public.private_property_maps;
  raise exception 'Guest can see private maps' using errcode='P9000';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
