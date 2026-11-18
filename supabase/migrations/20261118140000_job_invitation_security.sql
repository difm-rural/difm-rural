begin;

-- Preserve invitation IDs and history while making each send a new revision.
alter table public.job_invites
  drop constraint job_invites_status_check,
  add constraint job_invites_status_check check(status in ('pending','seen','accepted','declined','withdrawn')),
  add column revision integer not null default 1 check(revision>0),
  add column sent_at timestamptz;
update public.job_invites set sent_at=created_at where sent_at is null;
alter table public.job_invites alter column sent_at set default now(), alter column sent_at set not null;
drop policy if exists "Requester can invite to own jobs" on public.job_invites;
drop policy if exists "Provider can update own invite" on public.job_invites;
revoke insert,update,delete on public.job_invites from public,anon,authenticated;
revoke update(status) on public.job_invites from public,anon,authenticated;

create function public.job_invitation_active(p_job uuid,p_provider uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.job_invites i join public.jobs j on j.id=i.job_id
  where i.job_id=p_job and i.provider_id=p_provider and i.requester_id=j.requester_id
    and j.status='open' and i.status in ('pending','seen','accepted'));
$$;
revoke all on function public.job_invitation_active(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.is_invited_to_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.job_invitation_active(p_job_id,auth.uid());
$$;

-- A pending offer, a duplicate winner, or an accepted-looking bid on an open
-- job cannot grant an award. Cancelled work retains a previously recorded award.
create function public.job_awarded_to(p_job uuid,p_provider uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.jobs j join public.bids b on b.job_id=j.id
  where j.id=p_job and b.provider_id=p_provider and b.status='accepted'
    and b.provider_id<>j.requester_id
    and (j.status in ('accepted','in_progress','awaiting_completion','cancellation_requested','completed')
      or (j.status='cancelled' and j.accepted_at is not null))
    and not exists(select 1 from public.bids other where other.job_id=j.id
                   and other.id<>b.id and other.status='accepted'));
$$;
revoke all on function public.job_awarded_to(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.is_accepted_provider(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.job_awarded_to(p_job_id,auth.uid());
$$;

-- The bid policy only needs a caller/owner equality test. Keep the signature
-- but do not disclose another member's identifier through direct RPC.
create or replace function public.job_owner_id(p_job_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select j.requester_id from public.jobs j where j.id=p_job_id and j.requester_id=auth.uid();
$$;

create function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j where j.id=p_job and (
  j.visibility='public' or j.requester_id=auth.uid()
  or public.job_invitation_active(j.id,auth.uid()) or public.job_awarded_to(j.id,auth.uid())
  or public.current_user_is_admin() or auth.role()='service_role'
 ));
$$;
revoke all on function public.can_view_job(uuid) from public;
grant execute on function public.can_view_job(uuid) to anon,authenticated,service_role;

create or replace function public.can_see_job_location(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j where j.id=p_job_id and public.can_view_job(j.id)
  and (not j.hide_exact_location or j.requester_id=auth.uid()
    or public.job_awarded_to(j.id,auth.uid()) or public.current_user_is_admin() or auth.role()='service_role'));
$$;

-- Raw rows are needed by existing edit and completion flows. Discovery and
-- invitations use the masked projection, which repeats audience checks.
drop policy "Jobs are viewable by audience" on public.jobs;
create policy "Participants read raw jobs" on public.jobs for select to authenticated
 using(requester_id=auth.uid() or public.is_accepted_provider(id));
create or replace view public.jobs_public with (security_invoker=false,security_barrier=true) as
select j.id,j.requester_id,j.title,j.description,j.category,j.price_type,j.price,j.status,j.visibility,
 j.hide_exact_location,j.location_area,j.schedule_type,j.scheduled_date,j.date_from,j.date_to,
 j.materials_type,j.access_conditions,j.photos,j.area_hectares,j.cancellation_reason,j.cancellation_note,j.created_at,
 case when public.can_see_job_location(j.id) then j.location_name end as location_name,
 case when public.can_see_job_location(j.id) then j.latitude end as latitude,
 case when public.can_see_job_location(j.id) then j.longitude end as longitude,
 case when public.can_see_job_location(j.id) then j.location_note end as location_note,
 case when public.can_see_job_location(j.id) then j.area_polygon end as area_polygon
from public.jobs j where public.can_view_job(j.id);
-- The view runs its base read as its owner. It is a read-only API surface,
-- including on projects whose default privileges grant writes to new views.
revoke insert,update,delete,truncate,trigger,references on public.jobs_public from public,anon,authenticated;


drop policy "Providers can insert bids" on public.bids;
create policy "Providers can submit pending offers" on public.bids for insert to authenticated
 with check(provider_id=auth.uid() and status='pending' and exists(
  select 1 from public.jobs_public j where j.id=job_id and j.status='open' and j.requester_id<>auth.uid()
 ));

create or replace function public.protect_bid_integrity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.job_id is distinct from old.job_id or new.provider_id is distinct from old.provider_id
 then raise exception 'An offer cannot change its job or provider'; end if;
 if new.status is distinct from old.status and auth.uid() is not null then
  if public.job_owner_id(new.job_id) is distinct from auth.uid()
  then raise exception 'Only the job owner can change an offer status'; end if;
  if new.status='accepted' and (current_user in ('anon','authenticated') or old.status<>'pending' or not exists(
      select 1 from public.jobs j where j.id=new.job_id and j.status='accepted')
      or exists(select 1 from public.bids b where b.job_id=new.job_id and b.id<>new.id and b.status='accepted'))
  then raise exception 'Use the offer acceptance operation to accept a pending offer'; end if;
 end if;
 return new;
end $$;

-- Keep acceptance atomic and allow only the owner-checked RPC to set accepted.
create or replace function public.accept_job_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to accept an offer.'; end if;
  select * into offer from public.bids where id = p_offer_id;
  if not found then raise exception 'This offer is unavailable.'; end if;
  select * into job from public.jobs where id = offer.job_id for update;
  if not found or job.requester_id is distinct from auth.uid() then raise exception 'Only the requester can accept an offer.'; end if;
  if job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
  select * into offer from public.bids where id = p_offer_id for update;
  if not found or offer.status <> 'pending' or offer.provider_id=job.requester_id then raise exception 'This offer is no longer pending.'; end if;
  update public.jobs set status = 'accepted' where id = job.id;
  update public.bids set status = 'accepted' where id = offer.id;
  update public.bids set status = 'rejected' where job_id = job.id and id <> offer.id and status = 'pending';
end;
$$;

create or replace function public.job_media_visible(p_job uuid,p_viewer uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.jobs j where j.id=p_job and (
  j.requester_id=p_viewer or (j.visibility='public' and j.status<>'cancelled')
  or public.job_invitation_active(j.id,p_viewer) or public.job_awarded_to(j.id,p_viewer)
 ));
$$;

create function public.send_job_invitation(p_owner uuid,p_job uuid,p_provider uuid,p_revision integer default null)
returns void language plpgsql set search_path='' as $$
declare
 j public.jobs%rowtype;
 i public.job_invites%rowtype;
begin
 select * into j from public.jobs where id=p_job and requester_id=p_owner and status='open' for update;
 if not found then raise exception 'Choose one of your open jobs'; end if;
 -- Providing is available to every RC member. Require a different, existing profile.
 if p_provider is null or p_owner=p_provider or not exists(select 1 from public.profiles where id=p_provider)
 then raise exception 'Choose an eligible provider'; end if;
 select * into i from public.job_invites where job_id=p_job and provider_id=p_provider for update;
 if not found then
  if p_revision is not null then raise exception 'Invitation changed. Refresh and try again'; end if;
  insert into public.job_invites(job_id,requester_id,provider_id) values(p_job,p_owner,p_provider);
 elsif i.requester_id is distinct from p_owner then
  raise exception 'Invitation owner changed';
 elsif i.status in ('pending','seen','accepted') then
  return;
 elsif p_revision is not null and i.revision=p_revision then
  update public.job_invites set status='pending',revision=revision+1,sent_at=clock_timestamp() where id=i.id;
 else
  raise exception 'Use Invite again for a closed invitation';
 end if;
end $$;
revoke all on function public.send_job_invitation(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;

create or replace function public.invite_connection_to_job(p_job_id uuid,p_provider_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.send_job_invitation(auth.uid(),p_job_id,p_provider_id);
end $$;

create function public.reinvite_to_job(p_job_id uuid,p_provider_id uuid,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_revision is null then raise exception 'Invitation revision required'; end if;
 perform public.send_job_invitation(auth.uid(),p_job_id,p_provider_id,p_revision);
end $$;
revoke all on function public.reinvite_to_job(uuid,uuid,integer) from public,anon;
grant execute on function public.reinvite_to_job(uuid,uuid,integer) to authenticated;

create function public.respond_job_invitation(p_invite uuid,p_revision integer,p_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 target_job uuid;
 j public.jobs%rowtype;
 i public.job_invites%rowtype;
 next_status text;
begin
 select job_id into target_job from public.job_invites where id=p_invite and actor in (requester_id,provider_id);
 if not found then raise exception 'Invitation unavailable'; end if;
 select * into j from public.jobs where id=target_job and status='open' for update;
 if not found then raise exception 'Job is no longer open'; end if;
 select * into i from public.job_invites where id=p_invite and job_id=target_job for update;
 if not found or i.requester_id<>j.requester_id or i.revision is distinct from p_revision
  or i.status not in ('pending','seen','accepted') then raise exception 'Invitation changed. Refresh and try again'; end if;
 if p_action='withdraw' and actor=j.requester_id then next_status:='withdrawn';
 elsif actor=i.provider_id and p_action in ('view','accept','decline') then
  next_status:=case p_action when 'view' then case when i.status='pending' then 'seen' else i.status end
                when 'accept' then 'accepted' else 'declined' end;
 else raise exception 'Invitation action not permitted'; end if;
 if next_status<>i.status then update public.job_invites set status=next_status where id=i.id; end if;
 return target_job;
end $$;
revoke all on function public.respond_job_invitation(uuid,integer,text) from public,anon;
grant execute on function public.respond_job_invitation(uuid,integer,text) to authenticated;

create or replace function public.notify_job_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_name  text;
begin
  select title into v_title from public.jobs where id = NEW.job_id;
  select coalesce(display_name, full_name, 'Someone') into v_name
    from public.profiles where id = NEW.requester_id;

  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    NEW.provider_id,
    'new_job_invite',
    'Job invitation',
    coalesce(v_name,'Someone') || ' invited you to a job: ' || coalesce(v_title, 'a job'),
    jsonb_build_object('job_id', NEW.job_id, 'sender_id', NEW.requester_id)
  );
  return NEW;
end;
$$;

create trigger trg_notify_job_reinvite after update of revision on public.job_invites
 for each row when (old.revision is distinct from new.revision) execute function public.notify_job_invite();
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

create or replace function public.publish_job_with_primary_media(p_owner uuid,p_draft uuid,p_checksum text,p_details jsonb,p_provider uuid default null,p_public boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.job_primary_media%rowtype; d public.jobs%rowtype;
begin
  perform public.require_job_primary_media_enabled();
  select * into m from public.job_primary_media where draft_id=p_draft and requester_id=p_owner and state in ('staged','published') for update;
  if not found then raise exception 'Upload a primary photo first'; end if;
  if m.state='published' and m.job_id=p_draft and m.checksum=p_checksum then return m.job_id; end if;
  if m.state<>'staged' or m.edit_job_id is not null or m.job_id is not null or m.uploaded_at is null
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
  insert into public.jobs(id,requester_id,status,visibility,title,description,category,price_type,price,
    location_name,location_area,hide_exact_location,latitude,longitude,location_note,area_polygon,area_hectares,
    schedule_type,scheduled_date,date_from,date_to,materials_type,access_conditions,recurrence_frequency)
  values(p_draft,p_owner,'open',case when p_public then 'public' else 'invite_only' end,d.title,d.description,
    d.category,d.price_type,case when d.price_type='fixed' then d.price end,d.location_name,d.location_area,
    coalesce(d.hide_exact_location,true),d.latitude,d.longitude,d.location_note,d.area_polygon,d.area_hectares,
    d.schedule_type,d.scheduled_date,d.date_from,d.date_to,d.materials_type,d.access_conditions,'one_time');
  if p_provider is not null then
    perform public.send_job_invitation(p_owner,p_draft,p_provider);
  end if;
  update public.job_primary_media set job_id=p_draft,state='published' where object_key=m.object_key;
  return p_draft;
end $$;


create or replace function public.can_post_message(
  p_sender uuid,
  p_receiver uuid,
  p_job_id uuid,
  p_service_id uuid,
  p_booking_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_job public.jobs%rowtype;
  v_owner uuid;
begin
  if p_sender is null or p_receiver is null or p_sender = p_receiver then
    return false;
  end if;

  -- ── Job conversation ───────────────────────────────────────────────────────
  if p_job_id is not null then
    select * into v_job from public.jobs where id = p_job_id;
    if not found then return false; end if;

    if v_job.status in ('accepted', 'in_progress', 'completed') then
      -- Exactly the requester and the accepted provider.
      return (
        (p_sender = v_job.requester_id and exists (
           select 1 from public.bids b
           where b.job_id = p_job_id and b.provider_id = p_receiver and b.status = 'accepted'))
        or
        (p_receiver = v_job.requester_id and exists (
           select 1 from public.bids b
           where b.job_id = p_job_id and b.provider_id = p_sender and b.status = 'accepted'))
      );

    elsif v_job.status = 'open' then
      -- Requester ↔ a provider who has engaged (bid / invite / question /
      -- earlier message). An outsider with none of those is blocked both ways;
      -- the first message can only come from an engaged provider, so "earlier
      -- message" cannot be used to bootstrap.
      declare
        v_other uuid := case when p_sender = v_job.requester_id then p_receiver else p_sender end;
      begin
        if p_sender <> v_job.requester_id and p_receiver <> v_job.requester_id then
          return false;  -- one side must be the requester
        end if;
        if v_job.visibility='invite_only' and not public.job_invitation_active(p_job_id,v_other) then return false; end if;
        return exists (select 1 from public.bids b where b.job_id = p_job_id and b.provider_id = v_other)
            or public.job_invitation_active(p_job_id,v_other)
            or exists (select 1 from public.job_questions q where q.job_id = p_job_id and q.asker_id = v_other)
            or exists (select 1 from public.messages m where m.job_id = p_job_id and (m.sender_id = v_other or m.receiver_id = v_other));
      end;

    else
      return false;  -- cancelled / anything else: no new messages
    end if;
  end if;

  -- ── Listing enquiry ────────────────────────────────────────────────────────
  if p_service_id is not null then
    select provider_id into v_owner from public.services where id = p_service_id;
    if v_owner is null then return false; end if;
    if p_sender = v_owner then
      -- Owner may reply only to someone who has already enquired.
      return exists (select 1 from public.messages m
                     where m.service_id = p_service_id and (m.sender_id = p_receiver or m.receiver_id = p_receiver));
    else
      return p_receiver = v_owner;  -- enquirer → the owner
    end if;
  end if;

  -- ── Booking ────────────────────────────────────────────────────────────────
  if p_booking_id is not null then
    return exists (
      select 1 from public.bookings b
      where b.id = p_booking_id
        and p_sender in (b.requester_id, b.provider_id)
        and p_receiver in (b.requester_id, b.provider_id)
    );
  end if;

  return false;
end;
$$;


commit;
