-- Do not suggest previous providers who have already been invited to this job.
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
    (select count(*)::integer
       from past_providers p
      where p.provider_id is not null
        and not exists (
          select 1
            from public.job_invites i
           where i.job_id = p_job_id
             and i.provider_id = p.provider_id
        ));
end;
$$;

revoke all on function public.get_job_listing_performance(uuid) from public;
grant execute on function public.get_job_listing_performance(uuid) to authenticated;
