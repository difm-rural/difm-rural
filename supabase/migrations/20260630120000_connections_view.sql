-- Connections: the people a user has actually worked with.
-- A connection forms from COMPLETED work only — a completed job (the accepted
-- bidder) or a completed booking. Derived view, so it's always fresh and needs
-- no new data entry.
--
-- The view is symmetric: each row is a (requester_id, provider_id) pair.
--   • Requester perspective: filter `requester_id = <me>`  -> providers I've hired.
--   • Provider perspective:  filter `provider_id  = <me>`  -> my regulars.
-- It self-filters to the caller via auth.uid(), so a user can only ever see
-- their own relationships even if the client omits the filter.
--
-- Idempotent: safe to run more than once.

drop view if exists public.connections;
create view public.connections
  with (security_invoker = false) as
  with engagements as (
    -- Completed jobs — provider is the accepted bidder.
    select
      j.requester_id,
      b.provider_id,
      'job'::text        as kind,
      j.category         as category,
      j.created_at       as engaged_at
    from public.jobs j
    join public.bids b
      on b.job_id = j.id
     and b.status = 'accepted'
    where j.status = 'completed'
      and j.requester_id is not null
      and b.provider_id is not null

    union all

    -- Completed bookings — provider is direct on the booking.
    select
      bk.requester_id,
      bk.provider_id,
      'booking'::text    as kind,
      s.category         as category,
      bk.created_at      as engaged_at
    from public.bookings bk
    left join public.services s
      on s.id = bk.service_id
    where bk.status = 'completed'
      and bk.requester_id is not null
      and bk.provider_id is not null
  )
  select
    e.requester_id,
    e.provider_id,
    count(*)::int                                        as times_worked,
    count(*) filter (where e.kind = 'job')::int          as jobs_count,
    count(*) filter (where e.kind = 'booking')::int      as bookings_count,
    max(e.engaged_at)                                    as last_engaged_at,
    min(e.engaged_at)                                    as first_engaged_at,
    array_remove(array_agg(distinct e.category), null)   as categories
  from engagements e
  where auth.uid() in (e.requester_id, e.provider_id)
  group by e.requester_id, e.provider_id;

grant select on public.connections to authenticated;
