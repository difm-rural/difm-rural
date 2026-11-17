begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('job-primary-media','job-primary-media',false,1048576,array['image/jpeg']);

create table public.job_primary_media (
  draft_id uuid not null,
  requester_id uuid not null,
  object_key text primary key,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  job_id uuid unique references public.jobs(id) on delete set null,
  state text not null check (state in ('staged','published','deleting')),
  expires_at timestamptz not null default now() + interval '24 hours',
  uploaded_at timestamptz,
  cleanup_token uuid
);
create unique index job_primary_media_active_draft on public.job_primary_media(draft_id) where state in ('staged','published');
create index job_primary_media_expiry on public.job_primary_media(expires_at) where job_id is null;
alter table public.job_primary_media enable row level security;
revoke all on public.job_primary_media from public, anon, authenticated, service_role;

create table public.job_primary_media_control (
  singleton boolean primary key check (singleton),
  enabled boolean not null default false
);
insert into public.job_primary_media_control(singleton) values(true);
alter table public.job_primary_media_control enable row level security;
revoke all on public.job_primary_media_control from public,anon,authenticated,service_role;

create function public.require_job_primary_media_enabled()
returns void language plpgsql set search_path='' as $$
begin
  -- A disable operation waits for writes already past this boundary.
  perform 1 from public.job_primary_media_control where singleton and enabled for share;
  if not found then raise exception 'Photo posting is disabled'; end if;
end $$;
revoke all on function public.require_job_primary_media_enabled() from public,anon,authenticated,service_role;

create table public.job_photo_ai_quota (requester_id uuid primary key, window_start timestamptz not null, attempts int not null);
alter table public.job_photo_ai_quota enable row level security;
revoke all on public.job_photo_ai_quota from public,anon,authenticated,service_role;
create function public.claim_job_photo_analysis(p_owner uuid)
returns boolean language sql security definer set search_path='' as $$
  with claimed as (
    insert into public.job_photo_ai_quota as q values(p_owner,now(),1)
    on conflict(requester_id) do update set
      window_start=case when q.window_start<=now()-interval '24 hours' then now() else q.window_start end,
      attempts=case when q.window_start<=now()-interval '24 hours' then 1 else q.attempts+1 end
    where q.window_start<=now()-interval '24 hours' or q.attempts<10 returning 1
  ) select exists(select 1 from claimed)
$$;
revoke all on function public.claim_job_photo_analysis(uuid) from public,anon,authenticated;
grant execute on function public.claim_job_photo_analysis(uuid) to service_role;

-- Restrictive policies also protect the bucket if another permissive policy
-- matches it. All V1 reads and writes go through the gated Edge endpoint.
create policy "Primary media only via server" on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'job-primary-media')
  with check (bucket_id <> 'job-primary-media');

create function public.reserve_job_primary_media(p_owner uuid,p_draft uuid,p_checksum text)
returns text language plpgsql security definer set search_path='' as $$
declare m public.job_primary_media%rowtype;
begin
  perform public.require_job_primary_media_enabled();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('primary-media:'||p_owner,0));
  select * into m from public.job_primary_media where draft_id=p_draft and state in ('staged','published') for update;
  if found then
    if m.requester_id<>p_owner then raise exception 'Photo reservation unavailable'; end if;
    if m.state='published' then
      if m.job_id is distinct from p_draft or m.checksum is distinct from p_checksum
      then raise exception 'Photo reservation unavailable'; end if;
      return null;
    end if;
    if m.expires_at>clock_timestamp() and m.checksum=p_checksum then
      update public.job_primary_media set expires_at=greatest(expires_at,now()+interval '5 minutes') where object_key=m.object_key;
      return m.object_key;
    end if;
    update public.job_primary_media set state='deleting',expires_at=now()+interval '5 minutes' where object_key=m.object_key;
  end if;
  if (select count(*) from public.job_primary_media where requester_id=p_owner and state<>'published')>=5
  then raise exception 'Too many unpublished uploads'; end if;
  insert into public.job_primary_media(draft_id,requester_id,object_key,checksum,state)
  values(p_draft,p_owner,p_owner||'/'||p_draft||'/'||pg_catalog.gen_random_uuid()||'.jpg',p_checksum,'staged')
  returning object_key into m.object_key;
  return m.object_key;
end $$;

create function public.confirm_job_primary_upload(p_owner uuid,p_draft uuid,p_key text,p_checksum text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.require_job_primary_media_enabled();
  update public.job_primary_media m set uploaded_at=clock_timestamp()
  where m.requester_id=p_owner and m.draft_id=p_draft and m.object_key=p_key and m.checksum=p_checksum
    and m.state='staged' and m.job_id is null and m.expires_at>clock_timestamp()
    and exists(select 1 from storage.objects where bucket_id='job-primary-media' and name=m.object_key);
  if found then return true; end if;
  return exists(select 1 from public.job_primary_media where requester_id=p_owner and draft_id=p_draft
    and object_key=p_key and checksum=p_checksum and state='published' and job_id=p_draft);
end $$;

-- Only the media handler supplies the identity, after verifying the bearer.
-- The session-filtered connections view cannot represent this requester.
create function public.publish_job_with_primary_media(p_owner uuid,p_draft uuid,p_checksum text,p_details jsonb,p_provider uuid default null,p_public boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.job_primary_media%rowtype; d public.jobs%rowtype;
begin
  perform public.require_job_primary_media_enabled();
  select * into m from public.job_primary_media where draft_id=p_draft and requester_id=p_owner and state in ('staged','published') for update;
  if not found then raise exception 'Upload a primary photo first'; end if;
  if m.state='published' and m.job_id=p_draft and m.checksum=p_checksum then return m.job_id; end if;
  if m.state<>'staged' or m.job_id is not null or m.uploaded_at is null
     or m.checksum is distinct from p_checksum or m.expires_at<=clock_timestamp() or not exists (
    select 1 from storage.objects where bucket_id='job-primary-media' and name=m.object_key
  ) then raise exception 'Upload a primary photo first'; end if;
  d:=pg_catalog.jsonb_populate_record(null::public.jobs,p_details);
  if nullif(btrim(d.title),'') is null or length(d.title)>160 or nullif(btrim(d.description),'') is null
     or length(d.description)>2000 or coalesce(d.price_type,'') not in ('fixed','open')
     or (d.price_type='fixed' and (d.price is null or d.price<=0))
     or coalesce(d.schedule_type,'') not in ('specific','range','asap','flexible')
     or (d.schedule_type='specific' and d.scheduled_date is null)
     or (d.schedule_type='range' and (d.date_from is null or d.date_to is null or d.date_from>d.date_to))
     or p_public is null or (not p_public and p_provider is null)
  then raise exception 'Invalid job details'; end if;
  if p_provider is not null and (
    p_provider=p_owner or not exists(select 1 from public.profiles_public where id=p_provider)
    or not (
      exists(select 1 from public.jobs j join public.bids b on b.job_id=j.id
        where j.requester_id=p_owner and j.status='completed'
          and b.provider_id=p_provider and b.status='accepted')
      or exists(select 1 from public.bookings b
        where b.requester_id=p_owner and b.provider_id=p_provider and b.status='completed')
    )
  ) then raise exception 'Choose a previous provider'; end if;
  insert into public.jobs(id,requester_id,status,visibility,title,description,category,price_type,price,
    location_name,location_area,hide_exact_location,latitude,longitude,location_note,area_polygon,area_hectares,
    schedule_type,scheduled_date,date_from,date_to,materials_type,access_conditions,recurrence_frequency)
  values(p_draft,p_owner,'open',case when p_public then 'public' else 'invite_only' end,d.title,d.description,
    d.category,d.price_type,case when d.price_type='fixed' then d.price end,d.location_name,d.location_area,
    coalesce(d.hide_exact_location,true),d.latitude,d.longitude,d.location_note,d.area_polygon,d.area_hectares,
    d.schedule_type,d.scheduled_date,d.date_from,d.date_to,d.materials_type,d.access_conditions,'one_time');
  if p_provider is not null then
    insert into public.job_invites(job_id,requester_id,provider_id) values(p_draft,p_owner,p_provider);
  end if;
  update public.job_primary_media set job_id=p_draft,state='published' where object_key=m.object_key;
  return p_draft;
end $$;

create function public.read_job_primary_media(p_job uuid,p_viewer uuid)
returns text language sql stable security definer set search_path='' as $$
  select m.object_key from public.job_primary_media m join public.jobs j on j.id=m.job_id
  where j.id=p_job and j.requester_id=m.requester_id and m.state='published' and (
    j.requester_id=p_viewer
    or (j.visibility='public' and j.status<>'cancelled')
    or exists(select 1 from public.job_invites i where i.job_id=j.id and i.provider_id=p_viewer)
    or (j.visibility='public' and j.status='cancelled' and exists(
      select 1 from public.bids b where b.job_id=j.id and b.provider_id=p_viewer and b.status='accepted'
    ))
  );
$$;

create function public.claim_job_media_cleanup()
returns table(object_key text,lease_token uuid) language sql security definer set search_path='' as $$
  with claim as (
    select m.object_key from public.job_primary_media m
    where m.job_id is null and (m.state='published' or m.expires_at<=clock_timestamp())
    order by m.expires_at limit 1 for update skip locked
  )
  update public.job_primary_media m set state='deleting',expires_at=clock_timestamp()+interval '2 minutes',
    cleanup_token=pg_catalog.gen_random_uuid()
  from claim where m.object_key=claim.object_key returning m.object_key,m.cleanup_token;
$$;

create function public.finish_job_media_cleanup(p_key text,p_lease uuid)
returns boolean language sql security definer set search_path='' as $$
  with removed as (
    delete from public.job_primary_media m where m.object_key=p_key and m.state='deleting'
    and m.job_id is null and m.cleanup_token=p_lease and m.expires_at>clock_timestamp()
    and not exists(select 1 from storage.objects where bucket_id='job-primary-media' and name=p_key)
    returning 1
  ) select exists(select 1 from removed);
$$;

-- Legacy requesters and maintenance keep their existing update paths. V1
-- audience and ownership are fixed at publication, including for staff jobs.
create function public.guard_job_audience_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.visibility is distinct from old.visibility or new.requester_id is distinct from old.requester_id)
     and ((auth.uid() is not null and auth.uid() is distinct from old.requester_id)
          or exists(select 1 from public.job_primary_media where job_id=old.id)) then
    raise exception 'This job audience cannot be changed';
  end if;
  return new;
end $$;
revoke all on function public.guard_job_audience_changes() from public,anon,authenticated,service_role;
create trigger jobs_guard_audience_changes before update on public.jobs
  for each row execute function public.guard_job_audience_changes();

-- Older clients can still edit job details. Keep their public-photo write
-- path from attaching additional public objects to a V1 job.
create function public.reject_legacy_photos_on_primary_job()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new.photos,array[]::text[]) is distinct from coalesce(old.photos,array[]::text[])
     and exists(select 1 from public.job_primary_media where job_id=old.id) then
    raise exception 'This job uses a private primary photo';
  end if;
  return new;
end $$;
revoke all on function public.reject_legacy_photos_on_primary_job() from public,anon,authenticated,service_role;
create trigger prevent_legacy_photos_on_primary_job before update of photos on public.jobs
  for each row execute function public.reject_legacy_photos_on_primary_job();

create function public.owns_job_with_primary_media(p_job uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.job_primary_media where job_id=p_job and requester_id=auth.uid());
$$;
revoke all on function public.owns_job_with_primary_media(uuid) from public,anon;
grant execute on function public.owns_job_with_primary_media(uuid) to authenticated;

revoke all on function public.reserve_job_primary_media(uuid,uuid,text),
  public.confirm_job_primary_upload(uuid,uuid,text,text), public.read_job_primary_media(uuid,uuid),
  public.claim_job_media_cleanup(), public.finish_job_media_cleanup(text,uuid),
  public.publish_job_with_primary_media(uuid,uuid,text,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_job_primary_media(uuid,uuid,text),
  public.confirm_job_primary_upload(uuid,uuid,text,text), public.read_job_primary_media(uuid,uuid),
  public.claim_job_media_cleanup(), public.finish_job_media_cleanup(text,uuid),
  public.publish_job_with_primary_media(uuid,uuid,text,jsonb,uuid,boolean) to service_role;
commit;
