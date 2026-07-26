-- Evidence-only listing performance for requester-owned jobs.
--
-- A "view" means an authenticated provider opened the job detail. The owner,
-- anonymous visitors and requester-only accounts are deliberately excluded.
-- Requesters receive aggregate counts only; provider identities are private.

create table if not exists public.job_provider_views (
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  open_count integer not null default 1 check (open_count > 0),
  primary key (job_id, provider_id)
);

alter table public.job_provider_views enable row level security;
revoke all on public.job_provider_views from anon, authenticated;

create or replace function public.record_job_provider_view(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
      from public.jobs j
      join public.profiles p on p.id = v_user_id
     where j.id = p_job_id
       and j.requester_id <> v_user_id
       and j.status = 'open'
       and coalesce(j.visibility, 'public') = 'public'
       and coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both')
  ) then
    return false;
  end if;

  insert into public.job_provider_views (job_id, provider_id)
  values (p_job_id, v_user_id)
  on conflict (job_id, provider_id) do update
    set last_viewed_at = now(),
        open_count = public.job_provider_views.open_count + 1;

  return true;
end;
$$;

revoke all on function public.record_job_provider_view(uuid) from public;
grant execute on function public.record_job_provider_view(uuid) to authenticated;

create or replace function public.get_job_listing_performance(p_job_id uuid)
returns table (
  provider_views integer,
  matching_providers integer,
  previous_providers integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
      from public.jobs j
     where j.id = p_job_id
       and j.requester_id = auth.uid()
  ) then
    raise exception 'Not authorised';
  end if;

  return query
  with target_job as (
    select requester_id
      from public.jobs
     where id = p_job_id
  ),
  past_providers as (
    select b.provider_id
      from public.jobs j
      join public.bids b
        on b.job_id = j.id
       and b.status = 'accepted'
     where j.requester_id = (select requester_id from target_job)
       and j.status = 'completed'
    union
    select bk.provider_id
      from public.bookings bk
     where bk.requester_id = (select requester_id from target_job)
       and bk.status = 'completed'
  )
  select
    (select count(*)::integer
       from public.job_provider_views v
      where v.job_id = p_job_id),
    (select count(*)::integer
       from public.opportunity_candidates c
      where c.job_id = p_job_id),
    (select count(*)::integer from past_providers);
end;
$$;

revoke all on function public.get_job_listing_performance(uuid) from public;
grant execute on function public.get_job_listing_performance(uuid) to authenticated;
