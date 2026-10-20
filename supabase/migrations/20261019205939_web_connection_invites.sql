-- Private jobs and invitations commit together; retries cannot notify twice.
create or replace function public.invite_connection_to_job(p_job_id uuid,p_provider_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare job public.jobs%rowtype;
begin
 if auth.uid() is null or p_provider_id=auth.uid() then raise exception 'Invalid invitation.';end if;
 select * into job from public.jobs where id=p_job_id for update;
 if not found or job.requester_id is distinct from auth.uid() or job.status<>'open' then raise exception 'Choose one of your open jobs.';end if;
 if not exists(select 1 from public.connections where requester_id=auth.uid() and provider_id=p_provider_id and times_worked>0) or not exists(select 1 from public.profiles_public where id=p_provider_id) then raise exception 'Choose a previous provider.';end if;
 insert into public.job_invites(job_id,requester_id,provider_id) values(job.id,auth.uid(),p_provider_id) on conflict(job_id,provider_id) do nothing;
end;
$$;
revoke all on function public.invite_connection_to_job(uuid,uuid) from public,anon;
grant execute on function public.invite_connection_to_job(uuid,uuid) to authenticated;

create or replace function public.create_invited_job(p_job_id uuid,p_details jsonb,p_provider_id uuid,p_public boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare existing public.jobs%rowtype; draft public.jobs%rowtype;
begin
 if auth.uid() is null or p_job_id is null or p_provider_id=auth.uid() or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Invalid job request.';end if;
 -- Serialise repeated attempts for the same draft, including a lost response.
 perform pg_advisory_xact_lock(hashtextextended(p_job_id::text,0));
 select * into existing from public.jobs where id=p_job_id for update;
 if found then
  if existing.requester_id=auth.uid() and exists(select 1 from public.job_invites where job_id=p_job_id and provider_id=p_provider_id and requester_id=auth.uid()) then return existing.id;end if;
  raise exception 'This draft has already been used.';
 end if;
 if not exists(select 1 from public.connections where requester_id=auth.uid() and provider_id=p_provider_id and times_worked>0) then raise exception 'Choose a previous provider.';end if;
 draft=jsonb_populate_record(null::public.jobs,p_details);
 if nullif(trim(draft.title),'') is null or nullif(trim(draft.description),'') is null or draft.price_type not in ('fixed','open') or (draft.price_type='fixed' and (draft.price is null or draft.price<=0)) then raise exception 'Add valid job details.';end if;
 insert into public.jobs(id,requester_id,status,visibility,title,description,category,price_type,price,location_name,location_area,hide_exact_location,latitude,longitude,location_note,schedule_type,scheduled_date,date_from,date_to,materials_type,access_conditions,photos,area_polygon,area_hectares,recurrence_frequency,repeated_from_job_id)
 values(p_job_id,auth.uid(),'open',case when coalesce(p_public,false) then 'public' else 'invite_only' end,draft.title,draft.description,draft.category,draft.price_type,draft.price,draft.location_name,draft.location_area,coalesce(draft.hide_exact_location,true),draft.latitude,draft.longitude,draft.location_note,draft.schedule_type,draft.scheduled_date,draft.date_from,draft.date_to,draft.materials_type,draft.access_conditions,draft.photos,draft.area_polygon,draft.area_hectares,'one_time',draft.repeated_from_job_id);
 perform public.invite_connection_to_job(p_job_id,p_provider_id);
 return p_job_id;
end;
$$;
revoke all on function public.create_invited_job(uuid,jsonb,uuid,boolean) from public,anon;
grant execute on function public.create_invited_job(uuid,jsonb,uuid,boolean) to authenticated;
