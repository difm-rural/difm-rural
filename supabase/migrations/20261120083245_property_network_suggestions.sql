-- My Property Network grows from completed work. After a completed job or
-- booking the requester is offered "Add {provider} to your property network
-- for {area}?". Accepting activates the area if needed and links the provider
-- to the matching service (status has_provider) in one transaction. "Not now"
-- is remembered per provider and area so the offer is not repeated.
begin;

create table public.property_network_suggestion_dismissals (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider_id uuid not null references public.profiles(id) on delete cascade,
 area text not null check (area in ('water','land','fencing','livestock','access','upkeep','trees','machinery','spraying','feed','sitting')),
 created_at timestamptz not null default now(),
 primary key(owner_id,provider_id,area)
);
alter table public.property_network_suggestion_dismissals enable row level security;
revoke all on public.property_network_suggestion_dismissals from public,anon,authenticated;
grant select,insert on public.property_network_suggestion_dismissals to authenticated;
create policy property_network_own_dismissals_read on public.property_network_suggestion_dismissals for select to authenticated
 using(owner_id=(select auth.uid()));
create policy property_network_own_dismissals_add on public.property_network_suggestion_dismissals for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy "Assistants cannot insert" on public.property_network_suggestion_dismissals as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_suggestion_dismissals as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_suggestion_dismissals as restrictive for delete to public using (not public.is_assistant_token());

create function public.accept_property_network_suggestion(p_area text,p_service text,p_name text,p_provider uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid();
begin
 perform public.refuse_assistant_token();
 if actor is null then raise exception 'Sign in to add to your network'; end if;
 insert into public.property_network_areas(owner_id,area,active) values(actor,p_area,true)
 on conflict(owner_id,area) do update set active=true;
 perform public.link_property_network_provider(p_area,p_service,p_name,p_provider);
end $$;
revoke all on function public.accept_property_network_suggestion(text,text,text,uuid) from public,anon;
grant execute on function public.accept_property_network_suggestion(text,text,text,uuid) to authenticated;

commit;
