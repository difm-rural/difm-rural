begin;

alter table public.job_primary_media
  add column slot smallint not null default 0 check (slot between 0 and 6),
  add column edit_job_id uuid,
  drop constraint job_primary_media_job_id_key,
  add unique (job_id,slot);

-- Keep V1 audience protection after the last managed image is removed.
create table public.jobs_with_managed_photos (
  job_id uuid primary key references public.jobs(id) on delete cascade
);
alter table public.jobs_with_managed_photos enable row level security;
revoke all on public.jobs_with_managed_photos from public,anon,authenticated,service_role;

create or replace function public.guard_job_audience_changes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.visibility is distinct from old.visibility or new.requester_id is distinct from old.requester_id)
     and ((auth.uid() is not null and auth.uid() is distinct from old.requester_id)
          or exists(select 1 from public.job_primary_media where job_id=old.id)
          or exists(select 1 from public.jobs_with_managed_photos where job_id=old.id)) then
    raise exception 'This job audience cannot be changed';
  end if;
  return new;
end $$;

-- A managed job can drop old legacy references but cannot add public URLs.
create or replace function public.reject_legacy_photos_on_primary_job()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not (coalesce(new.photos,array[]::text[]) <@ coalesce(old.photos,array[]::text[]))
     and (exists(select 1 from public.job_primary_media where job_id=old.id)
          or exists(select 1 from public.jobs_with_managed_photos where job_id=old.id)) then
    raise exception 'This job uses private photos';
  end if;
  return new;
end $$;

create function public.check_job_photo_edit_binding()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.edit_job_id is not null and new.job_id is not null and new.job_id<>new.edit_job_id then
    raise exception 'This photo belongs to another job';
  end if;
  return new;
end $$;
create trigger guard_job_photo_edit_binding before insert or update on public.job_primary_media
for each row execute function public.check_job_photo_edit_binding();
revoke all on function public.check_job_photo_edit_binding() from public,anon,authenticated,service_role;

create function public.job_media_visible(p_job uuid,p_viewer uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.jobs j where j.id=p_job and (
    j.requester_id=p_viewer
    or (j.visibility='public' and j.status<>'cancelled')
    or exists(select 1 from public.job_invites i where i.job_id=j.id and i.provider_id=p_viewer)
    or (j.visibility='public' and j.status='cancelled' and exists(
      select 1 from public.bids b where b.job_id=j.id and b.provider_id=p_viewer and b.status='accepted'
    ))
  ));
$$;
revoke all on function public.job_media_visible(uuid,uuid) from public,anon,authenticated,service_role;

create function public.read_job_gallery_photo(p_job uuid,p_viewer uuid,p_photo uuid)
returns text language sql stable security definer set search_path='' as $$
  select m.object_key from public.job_primary_media m join public.jobs j on j.id=m.job_id
  where j.id=p_job and j.requester_id=m.requester_id and m.state='published'
    and ((p_photo is null and m.slot=0) or m.draft_id=p_photo)
    and public.job_media_visible(p_job,p_viewer);
$$;
revoke all on function public.read_job_gallery_photo(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_job_gallery_photo(uuid,uuid,uuid) to service_role;

create or replace function public.read_job_primary_media(p_job uuid,p_viewer uuid)
returns text language sql stable security definer set search_path='' as $$
  select public.read_job_gallery_photo(p_job,p_viewer,null);
$$;

create function public.list_job_private_photos(p_job uuid)
returns table(id uuid, slot smallint) language sql stable security definer set search_path='' as $$
  select m.draft_id,m.slot from public.job_primary_media m join public.jobs j on j.id=m.job_id
  where j.id=p_job and j.requester_id=m.requester_id and m.state='published'
    and public.job_media_visible(p_job,auth.uid()) order by m.slot;
$$;
revoke all on function public.list_job_private_photos(uuid) from public;
grant execute on function public.list_job_private_photos(uuid) to anon,authenticated;

create function public.reserve_job_edit_photo(p_owner uuid,p_job uuid,p_draft uuid,p_checksum text)
returns text language plpgsql security definer set search_path='' as $$
declare m public.job_primary_media%rowtype;
begin
  perform public.require_job_primary_media_enabled();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('primary-media:'||p_owner,0));
  if p_draft=p_job or not exists(select 1 from public.jobs where id=p_job and requester_id=p_owner and status='open')
    then raise exception 'Photo reservation unavailable'; end if;
  select * into m from public.job_primary_media where draft_id=p_draft and state in ('staged','published') for update;
  if found then
    if m.requester_id<>p_owner or m.edit_job_id is distinct from p_job or m.checksum is distinct from p_checksum
      then raise exception 'Photo reservation unavailable'; end if;
    if m.state='published' and m.job_id=p_job then return null; end if;
    if m.state='staged' and m.expires_at>clock_timestamp() then return m.object_key; end if;
    if m.state<>'staged' then raise exception 'Photo reservation unavailable'; end if;
    update public.job_primary_media set state='deleting',expires_at=clock_timestamp()+interval '5 minutes'
    where object_key=m.object_key;
  end if;
  if (select count(*) from public.job_primary_media where requester_id=p_owner and state='staged' and expires_at>clock_timestamp())>=12
    then raise exception 'Too many unpublished uploads'; end if;
  insert into public.job_primary_media(draft_id,requester_id,object_key,checksum,state,edit_job_id)
  values(p_draft,p_owner,p_owner||'/'||p_job||'/'||pg_catalog.gen_random_uuid()||'.jpg',p_checksum,'staged',p_job)
  returning object_key into m.object_key;
  return m.object_key;
end $$;
revoke all on function public.reserve_job_edit_photo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_job_edit_photo(uuid,uuid,uuid,text) to service_role;

create function public.save_job_with_private_photos(p_job uuid,p_details jsonb,p_expected uuid[],p_photos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  j public.jobs%rowtype;
  d public.jobs%rowtype;
  current_ids uuid[];
  desired_ids uuid[];
  item record;
  m public.job_primary_media%rowtype;
begin
  select * into j from public.jobs where id=p_job and requester_id=actor and status='open' for update;
  if not found then raise exception 'Only the requester can edit an open job'; end if;
  if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_photos) is distinct from 'array'
    then raise exception 'Invalid photo edit'; end if;
  d:=jsonb_populate_record(null::public.jobs,p_details);
  if not (coalesce(d.photos,array[]::text[]) <@ coalesce(j.photos,array[]::text[]))
    or jsonb_array_length(p_photos)+coalesce(cardinality(d.photos),0)>6
    then raise exception 'Invalid job photos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint,checksum text)
    where id is null or slot is null or slot not between 0 and 6)
    or (select count(distinct slot)<>count(*) or count(distinct id)<>count(*)
      from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint))
    then raise exception 'Invalid photo slots'; end if;
  select coalesce(array_agg(draft_id order by draft_id),'{}') into current_ids
    from public.job_primary_media where job_id=p_job and state='published';
  select coalesce(array_agg(id order by id),'{}') into desired_ids from jsonb_to_recordset(p_photos) as x(id uuid);
  if current_ids is distinct from p_expected and current_ids<>desired_ids
    then raise exception 'The gallery has changed. Refresh before saving'; end if;

  for item in select * from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint,checksum text) order by id loop
    select * into m from public.job_primary_media where draft_id=item.id and state in ('staged','published') for update;
    if not found or m.requester_id<>actor then raise exception 'Photo is unavailable'; end if;
    if m.job_id=p_job and m.state='published' and m.slot=item.slot
       and (item.checksum is null or item.checksum=m.checksum) then continue; end if;
    if m.job_id is not null or m.state<>'staged' or m.edit_job_id is distinct from p_job
       or m.uploaded_at is null or m.expires_at<=clock_timestamp() or m.checksum is distinct from item.checksum
       or not exists(select 1 from storage.objects where bucket_id='job-primary-media' and name=m.object_key)
      then raise exception 'Upload the photo again'; end if;
    perform public.require_job_primary_media_enabled();
  end loop;

  if cardinality(current_ids)>0 or cardinality(desired_ids)>0 then
    insert into public.jobs_with_managed_photos values(p_job) on conflict do nothing;
  end if;
  update public.jobs set title=d.title,description=d.description,category=d.category,
    price_type=d.price_type,price=d.price,location_name=d.location_name,location_area=d.location_area,
    location_note=d.location_note,hide_exact_location=d.hide_exact_location,latitude=d.latitude,longitude=d.longitude,
    schedule_type=d.schedule_type,scheduled_date=d.scheduled_date,date_from=d.date_from,date_to=d.date_to,
    materials_type=d.materials_type,access_conditions=d.access_conditions,photos=d.photos,
    area_polygon=case when (j.location_name,j.latitude,j.longitude) is distinct from (d.location_name,d.latitude,d.longitude)
                      then null else j.area_polygon end,
    area_hectares=case when (j.location_name,j.latitude,j.longitude) is distinct from (d.location_name,d.latitude,d.longitude)
                      then null else j.area_hectares end
  where id=p_job;
  update public.job_primary_media set job_id=null,state='deleting',expires_at=clock_timestamp()
    where job_id=p_job and not (draft_id=any(desired_ids));
  update public.job_primary_media media set job_id=p_job,state='published',slot=x.slot
    from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint)
    where media.draft_id=x.id and media.state='staged' and media.edit_job_id=p_job;
  return p_job;
end $$;
revoke all on function public.save_job_with_private_photos(uuid,jsonb,uuid[],jsonb) from public,anon;
grant execute on function public.save_job_with_private_photos(uuid,jsonb,uuid[],jsonb) to authenticated;

commit;
