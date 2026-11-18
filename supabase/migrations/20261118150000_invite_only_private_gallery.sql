begin;
set local lock_timeout='5s';

-- The rollout skips object migration only when both the attachment inventory
-- and known legacy Storage paths are empty. Keep this check at apply time.
lock table public.jobs, public.messages, storage.objects in share row exclusive mode;
do $$
begin
 if exists(select 1 from public.jobs where visibility='invite_only' and cardinality(photos)>0)
    or exists(select 1 from storage.objects o join public.jobs j
     on j.id::text in (split_part(o.name,'/',1),split_part(o.name,'/',2))
     where o.bucket_id='job-photos' and j.visibility='invite_only')
    or exists(select 1 from public.messages m join public.jobs j on j.id=m.job_id
      where j.visibility='invite_only' and m.content like '%/storage/v1/object/public/job-photos/%')
 then raise exception 'Legacy invite-only job photos require verified private migration'; end if;
end $$;

create function public.guard_invite_only_legacy_photos()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.visibility='invite_only' then
  if cardinality(new.photos)>0 then raise exception 'Invite-only jobs use private photos'; end if;
  if tg_op='INSERT' or old.visibility is distinct from new.visibility then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('legacy-job-photo:'||new.id::text,0));
   if exists(select 1 from storage.objects o where o.bucket_id='job-photos'
     and (o.name like new.id::text||'/%' or split_part(o.name,'/',2)=new.id::text))
   then raise exception 'This job has public photo uploads'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_invite_only_legacy_photos() from public,anon,authenticated,service_role;
create trigger guard_invite_only_legacy_photos before insert or update of photos,visibility on public.jobs
 for each row execute function public.guard_invite_only_legacy_photos();

create function public.legacy_job_photo_upload_allowed(p_path text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare
 first_folder text:=split_part(p_path,'/',1);
 job_folder text;
begin
 job_folder:=case when first_folder=auth.uid()::text and split_part(p_path,'/',3)<>'' then split_part(p_path,'/',2) else first_folder end;
 if job_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return true; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('legacy-job-photo:'||job_folder,0));
 return not exists(select 1 from public.jobs j where j.id=job_folder::uuid and j.visibility='invite_only');
end $$;
revoke all on function public.legacy_job_photo_upload_allowed(text) from public,anon,service_role;
grant execute on function public.legacy_job_photo_upload_allowed(text) to authenticated;

create policy "Invite-only jobs cannot upload public job photos"
 on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'job-photos' or public.legacy_job_photo_upload_allowed(name));
create policy "Invite-only jobs cannot replace public job photos"
 on storage.objects as restrictive for update to authenticated
 with check (bucket_id<>'job-photos' or public.legacy_job_photo_upload_allowed(name));

-- Job chat shares the public bucket and uses the same job-scoped path.
-- Keep text chat available and reject new legacy photo links on private jobs.
create function public.guard_invite_only_message_photos()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.job_id is not null and new.content like '%/storage/v1/object/public/job-photos/%'
    and exists(select 1 from public.jobs where id=new.job_id and visibility='invite_only')
 then raise exception 'Add photos to the private job gallery instead'; end if;
 return new;
end $$;
revoke all on function public.guard_invite_only_message_photos() from public,anon,authenticated,service_role;
create trigger guard_invite_only_message_photos before insert or update of content,job_id on public.messages
 for each row execute function public.guard_invite_only_message_photos();

-- Draft gallery photos use the same staged records and expiry as edit photos.
-- Binding a draft to a job ID does not grant the uploader permission to edit
-- an existing job or attach an object to someone else's draft.
create function public.reserve_job_draft_gallery_photo(p_owner uuid,p_job uuid,p_draft uuid,p_checksum text)
returns text language plpgsql security definer set search_path='' as $$
declare m public.job_primary_media%rowtype;
begin
 perform public.require_job_primary_media_enabled();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('primary-media:'||p_owner,0));
 if p_draft=p_job then raise exception 'Invalid gallery photo'; end if;
 select * into m from public.job_primary_media where draft_id=p_draft and state in ('staged','published') for update;
 if found then
  if m.requester_id<>p_owner or m.edit_job_id is distinct from p_job or m.checksum is distinct from p_checksum
  then raise exception 'Photo reservation unavailable'; end if;
  if m.state='published' and m.job_id=p_job then return null; end if;
  if m.state='staged' and m.expires_at>clock_timestamp() then return m.object_key; end if;
  update public.job_primary_media set state='deleting',expires_at=clock_timestamp()+interval '5 minutes'
   where object_key=m.object_key;
 end if;
 if exists(select 1 from public.jobs where id=p_job)
    or (select count(*) from public.job_primary_media where requester_id=p_owner and state='staged' and expires_at>clock_timestamp())>=12
 then raise exception 'Photo reservation unavailable'; end if;
 insert into public.job_primary_media(draft_id,requester_id,object_key,checksum,state,edit_job_id)
 values(p_draft,p_owner,p_owner||'/'||p_job||'/'||pg_catalog.gen_random_uuid()||'.jpg',p_checksum,'staged',p_job)
 returning object_key into m.object_key;
 return m.object_key;
end $$;
revoke all on function public.reserve_job_draft_gallery_photo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_job_draft_gallery_photo(uuid,uuid,uuid,text) to service_role;

create function public.publish_job_with_private_gallery(
 p_owner uuid,p_job uuid,p_checksum text,p_details jsonb,p_provider uuid,p_public boolean,p_gallery jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare j_id uuid; photo record; m public.job_primary_media%rowtype; is_retry boolean;
begin
 if jsonb_typeof(p_gallery) is distinct from 'array' or jsonb_array_length(p_gallery)>5 then
  raise exception 'Choose up to six photos';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_gallery) as x(id uuid,slot integer,checksum text)
  where id is null or id=p_job or slot is null or slot not between 1 and 5 or checksum is null)
  or (select count(*)<>count(distinct id) or count(*)<>count(distinct slot)
      from jsonb_to_recordset(p_gallery) as x(id uuid,slot integer))
 then raise exception 'Invalid gallery'; end if;
 -- The primary RPC and all extra attachments run in the same transaction.
 select state='published' into is_retry from public.job_primary_media
 where requester_id=p_owner and draft_id=p_job and state in ('staged','published') for update;
 j_id:=public.publish_job_with_primary_media(p_owner,p_job,p_checksum,p_details,p_provider,p_public);
 for photo in select * from jsonb_to_recordset(p_gallery) as x(id uuid,slot integer,checksum text) order by id loop
  select * into m from public.job_primary_media where draft_id=photo.id and state in ('staged','published') for update;
  if not found or m.requester_id<>p_owner or m.edit_job_id is distinct from j_id or m.checksum is distinct from photo.checksum
  then raise exception 'Gallery photo unavailable'; end if;
  if m.state='published' and m.job_id=j_id and m.slot=photo.slot then continue; end if;
  if is_retry or m.state<>'staged' or m.job_id is not null or m.uploaded_at is null or m.expires_at<=clock_timestamp()
     or not exists(select 1 from storage.objects where bucket_id='job-primary-media' and name=m.object_key)
  then raise exception 'Gallery photo unavailable'; end if;
  update public.job_primary_media set job_id=j_id,state='published',slot=photo.slot where object_key=m.object_key;
 end loop;
 if (select count(*) from public.job_primary_media where job_id=j_id and state='published')<>jsonb_array_length(p_gallery)+1
 then raise exception 'Gallery has changed'; end if;
 return j_id;
end $$;
revoke all on function public.publish_job_with_private_gallery(uuid,uuid,text,jsonb,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.publish_job_with_private_gallery(uuid,uuid,text,jsonb,uuid,boolean,jsonb) to service_role;

commit;
