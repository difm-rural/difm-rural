-- Finish one arrangement and update advertising atomically; other bookings
-- on the listing retain their own status and history.
create or replace function public.complete_grazing_arrangement(p_booking_id uuid, p_relist boolean default false)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  arrangement public.bookings%rowtype;
  listing public.services%rowtype;
begin
  select * into arrangement from public.bookings where id = p_booking_id for update;
  if not found or arrangement.provider_id is distinct from auth.uid() then
    raise exception 'Only the provider can complete this arrangement.';
  end if;
  select * into listing from public.services where id = arrangement.service_id for update;
  if not found or listing.provider_id is distinct from auth.uid() or listing.kind <> 'grazing' then
    raise exception 'This grazing listing is unavailable.';
  end if;
  if arrangement.status not in ('confirmed', 'in_progress') then
    raise exception 'This arrangement has changed. Refresh before trying again.';
  end if;
  update public.bookings set status = 'completed' where id = arrangement.id;
  update public.services set is_active = p_relist,
    closed_at = case when p_relist then null else now() end
    where id = listing.id;
end;
$$;
revoke all on function public.complete_grazing_arrangement(uuid, boolean) from public, anon;
grant execute on function public.complete_grazing_arrangement(uuid, boolean) to authenticated;
