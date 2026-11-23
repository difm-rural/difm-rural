begin;
create function public.can_read_listing_location(listing_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bookings b where b.service_id=listing_id
 and b.requester_id=auth.uid() and b.status in ('confirmed','in_progress','awaiting_completion','completed','cancellation_requested'))
$$;
revoke all on function public.can_read_listing_location(uuid) from public;
grant execute on function public.can_read_listing_location(uuid) to anon,authenticated;
create policy "Accepted booking participants can read listing" on public.services for select to authenticated using(public.can_read_listing_location(id));
-- Restrictive policy protects against other permissive public SELECT policies.
-- Existing owner/admin/write policies and booking RLS remain in force.
create policy "Listing raw locations are private" on public.services as restrictive for select to anon,authenticated
 using(provider_id=(select auth.uid()) or public.can_read_listing_location(id) or public.current_user_is_admin());
-- Definer view deliberately bypasses raw-table RLS, but publishes only public
-- listing fields and coarse location. Also retains participant history for closed listings.
do $$ declare fields text; begin
 select string_agg(case
 when a.attname='location_name' then 'public.locality_from_address(s.location_name) as location_name'
 when a.attname in ('latitude','longitude','service_latitude','service_longitude','location_note')
 then format('null::%s as %I',format_type(a.atttypid,a.atttypmod),a.attname)
 else format('s.%I',a.attname) end,', ' order by a.attnum) into fields
 from pg_attribute a where a.attrelid='public.services'::regclass and a.attnum>0 and not a.attisdropped;
 execute 'create view public.services_public with (security_barrier=true) as select '||fields||',
 round(coalesce(s.latitude,s.service_latitude)::numeric,1)::double precision as discovery_latitude,
 round(coalesce(s.longitude,s.service_longitude)::numeric,1)::double precision as discovery_longitude,
 true as discovery_location_approximate
 from public.services s where (s.is_active and s.closed_at is null) or s.provider_id=auth.uid()
 or exists(select 1 from public.bookings b where b.service_id=s.id and auth.uid() in (b.requester_id,b.provider_id))';
end $$;
revoke all on public.services_public from public,anon,authenticated;
grant select on public.services_public to anon,authenticated;
comment on view public.services_public is 'Read-only listing discovery and booking context. Locality only, no exact pins; rounded coordinates support approximate distance filtering.';
notify pgrst,'reload schema';
commit;
