begin;
-- Keep the legacy services table and FK identities, but never store exact
-- public-readable locations there. The pending migration has not shipped yet.
lock table public.services in access exclusive mode;
create function public.can_read_listing_location(listing_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bookings b where b.service_id=listing_id
 and b.requester_id=auth.uid() and b.status in ('confirmed','in_progress','awaiting_completion','completed','cancellation_requested'))
$$;
create function public.can_read_listing_context(listing_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bookings b where b.service_id=listing_id
 and auth.uid() in (b.requester_id,b.provider_id))
$$;
revoke all on function public.can_read_listing_location(uuid),public.can_read_listing_context(uuid) from public;
grant execute on function public.can_read_listing_location(uuid),public.can_read_listing_context(uuid) to anon,authenticated;
create table public.service_private_locations (
 service_id uuid primary key references public.services(id) on delete cascade deferrable initially deferred,
 location_name text,latitude numeric,longitude numeric,service_latitude numeric,service_longitude numeric,location_note text
);
alter table public.service_private_locations enable row level security;
revoke all on public.service_private_locations from public,anon,authenticated;
grant select on public.service_private_locations to authenticated;
create policy "Listing location participants" on public.service_private_locations for select to authenticated
 using(exists(select 1 from public.services s where s.id=service_id and s.provider_id=(select auth.uid()))
 or public.can_read_listing_location(service_id) or public.current_user_is_admin());
insert into public.service_private_locations
 select s.id,s.location_name,s.latitude,s.longitude,s.service_latitude,s.service_longitude,to_jsonb(s)->>'location_note' from public.services s;
-- The private FK is deferred so a BEFORE INSERT trigger can capture the exact
-- input, scrub NEW, and leave legacy INSERT/UPDATE/RETURNING contracts intact.
create function public.protect_listing_location() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior public.service_private_locations; saved public.service_private_locations; candidate jsonb;
begin
 select * into prior from public.service_private_locations where service_id=new.id for update;
 candidate:=to_jsonb(new);
 if tg_op='INSERT' then
  -- BEFORE INSERT also runs for ON CONFLICT DO NOTHING. Never let a retry
  -- or another owner overwrite an existing private location as a side effect.
  if prior.service_id is null and not exists(select 1 from public.services where id=new.id) then
   insert into public.service_private_locations values(new.id,candidate->>'location_name',
    (candidate->>'latitude')::numeric,(candidate->>'longitude')::numeric,
    (candidate->>'service_latitude')::numeric,(candidate->>'service_longitude')::numeric,candidate->>'location_note')
   on conflict(service_id) do nothing;
  end if;
 elsif prior.service_id is null or new.location_name is distinct from old.location_name then
  -- Updated owner editors hydrate the original private address but may omit an
  -- unchanged pin. Do not erase that pin when re-saving the same exact address.
  if prior.service_id is not null and new.location_name is not distinct from prior.location_name
     and new.latitude is null and new.longitude is null then
   candidate:=candidate || jsonb_build_object('latitude',prior.latitude,'longitude',prior.longitude,
    'service_latitude',prior.service_latitude,'service_longitude',prior.service_longitude);
  end if;
  insert into public.service_private_locations values(new.id,candidate->>'location_name',
   (candidate->>'latitude')::numeric,(candidate->>'longitude')::numeric,
   (candidate->>'service_latitude')::numeric,(candidate->>'service_longitude')::numeric,candidate->>'location_note')
  on conflict(service_id) do update set location_name=excluded.location_name,latitude=excluded.latitude,
   longitude=excluded.longitude,service_latitude=excluded.service_latitude,service_longitude=excluded.service_longitude,
   location_note=excluded.location_note;
 end if;
 select * into strict saved from public.service_private_locations where service_id=new.id;
 -- A legacy editor re-saving the coarse response cannot overwrite the original
 -- private address/pin. Legacy distance filters already use service_* fallback.
 new:=jsonb_populate_record(new,jsonb_build_object('location_name',public.locality_from_address(saved.location_name),
  'latitude',null,'longitude',null,'location_note',null,
  'service_latitude',round(coalesce(saved.latitude,saved.service_latitude),1),
  'service_longitude',round(coalesce(saved.longitude,saved.service_longitude),1)));
 return new;
end $$;
revoke all on function public.protect_listing_location() from public,anon,authenticated;
create trigger protect_listing_location before insert or update on public.services
 for each row execute function public.protect_listing_location();
-- Atomic backfill: the table lock prevents readers seeing an intermediate state.
-- Existing price/date/text validation ignores unchanged corresponding fields.
update public.services set location_name=location_name;
create policy "Booking participants can read listing context" on public.services for select to authenticated
 using(public.can_read_listing_context(id));
create policy "Listing public context or participants" on public.services as restrictive for select to anon,authenticated
 using((is_active and closed_at is null) or provider_id=(select auth.uid())
 or public.can_read_listing_context(id) or public.current_user_is_admin());
-- Updated consumers keep their public view. Exact location is accessed only
-- through service_private_locations with its own participant/owner RLS.
do $$ declare fields text; begin
 select string_agg(case
 when a.attname in ('latitude','longitude','service_latitude','service_longitude','location_note')
 then format('null::%s as %I',format_type(a.atttypid,a.atttypmod),a.attname)
 else format('s.%I',a.attname) end,', ' order by a.attnum) into fields
 from pg_attribute a where a.attrelid='public.services'::regclass and a.attnum>0 and not a.attisdropped;
 execute 'create view public.services_public with (security_barrier=true) as select '||fields||',
 s.service_latitude::double precision as discovery_latitude,
 s.service_longitude::double precision as discovery_longitude,true as discovery_location_approximate
 from public.services s where (s.is_active and s.closed_at is null) or s.provider_id=auth.uid()
 or public.can_read_listing_context(s.id)';
end $$;
revoke all on public.services_public from public,anon,authenticated;
grant select on public.services_public to anon,authenticated;
comment on table public.service_private_locations is 'Exact provider listing locations: owner/admin or accepted requester only. Writes only through the protected services trigger.';
comment on view public.services_public is 'Public locality/approximate-distance listing context; compatible legacy services reads contain coarse data only.';
notify pgrst,'reload schema';
commit;
