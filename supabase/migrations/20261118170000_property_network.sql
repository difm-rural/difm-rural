begin;

create table public.property_network_areas (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 area text not null check (area in ('water','land','fencing','livestock','access','upkeep','trees','machinery')),
 active boolean not null,
 primary key(owner_id,area)
);
create table public.property_network_services (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 area text not null check (area in ('water','land','fencing','livestock','access','upkeep','trees','machinery')),
 service_key text not null check (service_key ~ '^(suggested-[1-4]|custom-[a-f0-9-]{36})$'),
 name text not null check (char_length(btrim(name)) between 1 and 80),
 status text check (status in ('has_provider','self','needs_help','irrelevant')),
 primary key(owner_id,area,service_key)
);
create table public.property_network_providers (
 owner_id uuid not null,
 area text not null,
 service_key text not null,
 provider_id uuid not null references public.profiles(id) on delete cascade,
 primary key(owner_id,area,service_key,provider_id),
 foreign key(owner_id,area,service_key) references public.property_network_services(owner_id,area,service_key) on delete cascade,
 check(owner_id<>provider_id)
);
create index property_network_providers_profile_idx on public.property_network_providers(provider_id);

alter table public.property_network_areas enable row level security;
alter table public.property_network_services enable row level security;
alter table public.property_network_providers enable row level security;
revoke all on public.property_network_areas,public.property_network_services,public.property_network_providers from public,anon,authenticated;
grant select,insert,update on public.property_network_areas,public.property_network_services to authenticated;
grant select,insert,delete on public.property_network_providers to authenticated;

create policy property_network_own_areas on public.property_network_areas for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy property_network_own_services on public.property_network_services for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy property_network_read_links on public.property_network_providers for select to authenticated
 using(owner_id=(select auth.uid()));
create policy property_network_link_visible_provider on public.property_network_providers for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.profiles_public p where p.id=provider_id));
create policy property_network_remove_link on public.property_network_providers for delete to authenticated
 using(owner_id=(select auth.uid()));

-- A suggested service is stored only when the owner uses it. The service and
-- its new provider link commit together under the caller's normal RLS rules.
create function public.link_property_network_provider(p_area text,p_service text,p_name text,p_provider uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid();
begin
 if actor is null or p_provider=actor then raise exception 'Choose an available provider'; end if;
 insert into public.property_network_services(owner_id,area,service_key,name,status)
 values(actor,p_area,p_service,btrim(p_name),'has_provider')
 on conflict(owner_id,area,service_key) do update set status='has_provider';
 insert into public.property_network_providers(owner_id,area,service_key,provider_id)
 values(actor,p_area,p_service,p_provider)
 on conflict do nothing;
end $$;
revoke all on function public.link_property_network_provider(text,text,text,uuid) from public,anon;
grant execute on function public.link_property_network_provider(text,text,text,uuid) to authenticated;

commit;
