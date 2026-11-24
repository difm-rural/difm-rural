begin;
-- Private annotations of existing owned jobs, not a second job history.
create table public.property_network_jobs (
 owner_id uuid not null,
 area text not null,
 job_id uuid not null references public.jobs(id) on delete cascade,
 primary key (owner_id,area,job_id),
 foreign key (owner_id,area) references public.property_network_areas(owner_id,area) on delete cascade
);
alter table public.property_network_jobs enable row level security;
revoke all on public.property_network_jobs from public,anon,authenticated;
grant select,insert,delete on public.property_network_jobs to authenticated;
create policy property_network_jobs_read on public.property_network_jobs for select to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id and j.requester_id=(select auth.uid())));
create policy property_network_jobs_add on public.property_network_jobs for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id and j.requester_id=(select auth.uid()) and j.status in ('open','accepted','completed')));
create policy property_network_jobs_remove on public.property_network_jobs for delete to authenticated
 using(owner_id=(select auth.uid()));
create policy "Assistants cannot read" on public.property_network_jobs as restrictive for select to public using(not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_jobs as restrictive for insert to public with check(not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_jobs as restrictive for delete to public using(not public.is_assistant_token());
-- Replace only this owner's private service assignment, atomically.
create function public.replace_property_network_provider(p_area text,p_service text,p_previous uuid,p_provider uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); service_name text; previous_status text;
begin
 if actor is null or public.is_assistant_token() or p_provider=actor or p_provider=p_previous then raise exception 'Choose an available provider'; end if;
 select name,status into service_name,previous_status from public.property_network_services where owner_id=actor and area=p_area and service_key=p_service for update;
 if not exists(select 1 from public.property_network_providers where owner_id=actor and area=p_area and service_key=p_service and provider_id=p_previous) then raise exception 'Assignment unavailable'; end if;
 perform public.link_property_network_provider(p_area,p_service,service_name,p_provider);
 delete from public.property_network_providers where owner_id=actor and area=p_area and service_key=p_service and provider_id=p_previous;
 if previous_status='needs_help' then
  update public.property_network_services set status=previous_status where owner_id=actor and area=p_area and service_key=p_service;
 end if;
end $$;
revoke all on function public.replace_property_network_provider(text,text,uuid,uuid) from public,anon;
grant execute on function public.replace_property_network_provider(text,text,uuid,uuid) to authenticated;
commit;
