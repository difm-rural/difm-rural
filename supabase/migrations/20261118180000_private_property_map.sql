begin;

create function public.is_private_property_map_point(p jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p)='object' and p - array['latitude','longitude']='{}' and jsonb_typeof(p->'latitude')='number'
  and jsonb_typeof(p->'longitude')='number' then
  (p->>'latitude')::numeric between -85 and 85 and (p->>'longitude')::numeric between -180 and 180
  else false end;
$$;

create function public.is_private_property_map(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare f jsonb; v jsonb; n integer;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>120000 then return false; end if;
 if not (p ?& array['name','propertyType','areaHa','paddocks','water','livestock','surface','camera','pin','boundary','features'])
    or p - array['name','propertyType','areaHa','paddocks','water','livestock','surface','camera','pin','boundary','features'] <> '{}' then return false; end if;
 foreach v in array array[p->'name',p->'water',p->'livestock',p->'surface'] loop
  if jsonb_typeof(v) is distinct from 'string' or length(v #>> '{}')>120 then return false; end if;
 end loop;
 if jsonb_typeof(p->'propertyType')<>'string' or p->>'propertyType' not in ('','Lifestyle block','Farm','Rural residential')
    or jsonb_typeof(p->'areaHa')<>'string' or p->>'areaHa' !~ '^([0-9]{1,7}(\.[0-9]{1,8})?)?$'
    or jsonb_typeof(p->'paddocks')<>'string' or p->>'paddocks' !~ '^[0-9]{0,6}$' then return false; end if;
 if coalesce(nullif(p->>'areaHa','')::numeric,0)>1000000 or coalesce(nullif(p->>'paddocks','')::numeric,0)>100000 then return false; end if;
 if not public.is_private_property_map_point((p->'camera')-'zoom') or jsonb_typeof(p->'camera'->'zoom') is distinct from 'number' then return false; end if;
 if (p->'camera'->>'zoom')::numeric not between 4 and 20 then return false; end if;
 if p->'pin' <> 'null' and not public.is_private_property_map_point(p->'pin') then return false; end if;
 if jsonb_typeof(p->'boundary')<>'array' or jsonb_typeof(p->'features')<>'array' then return false; end if;
 n:=jsonb_array_length(p->'boundary');
 if n between 1 and 2 or n>100 or jsonb_array_length(p->'features')>50 then return false; end if;
 if exists(select from jsonb_array_elements(p->'boundary') q where not public.is_private_property_map_point(q)) then return false; end if;
 for f in select * from jsonb_array_elements(p->'features') loop
  if jsonb_typeof(f) is distinct from 'object' or not (f ?& array['id','kind','name','points'])
    or f - array['id','kind','name','points'] <> '{}' or coalesce(f->>'id','') !~ '^[0-9a-f-]{36}$'
    or coalesce(f->>'kind','') not in ('tank','pump','trough','gate','building','driveway')
    or jsonb_typeof(f->'name') is distinct from 'string' or length(f->>'name')>120
    or jsonb_typeof(f->'points') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(f->'points');
  if (f->>'kind'='driveway' and n not between 2 and 100) or (f->>'kind'<>'driveway' and n<>1) then return false; end if;
  if exists(select from jsonb_array_elements(f->'points') q where not public.is_private_property_map_point(q)) then return false; end if;
 end loop;
 return (select count(distinct q->>'id')=count(*) from jsonb_array_elements(p->'features') q);
end $$;

create table public.private_property_maps (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 profile jsonb not null check(public.is_private_property_map(profile)),
 revision integer not null check(revision>0)
);
alter table public.private_property_maps enable row level security;
revoke all on public.private_property_maps from public,anon,authenticated;
grant select,insert,update on public.private_property_maps to authenticated;
create policy private_property_map_owner on public.private_property_maps for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- OAuth assistant JWTs share the owner's authenticated role and subject. Owner
-- identity alone must never grant writes. Use the claim directly because this
-- migration also precedes is_assistant_token() on a fresh database replay.
create policy "Assistants cannot insert" on public.private_property_maps
 as restrictive for insert to public
 with check ((select auth.jwt()->>'client_id') is null);
create policy "Assistants cannot update" on public.private_property_maps
 as restrictive for update to public
 using ((select auth.jwt()->>'client_id') is null)
 with check ((select auth.jwt()->>'client_id') is null);
create policy "Assistants cannot delete" on public.private_property_maps
 as restrictive for delete to public
 using ((select auth.jwt()->>'client_id') is null);
commit;
