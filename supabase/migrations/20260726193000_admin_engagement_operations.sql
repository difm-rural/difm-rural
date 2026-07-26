-- Privacy-safe administration for engagement, supply and work coordination.
-- Aggregate RPCs deliberately avoid provider-view identities, saved-search
-- contents, private calendar records and user preference mutation.

create or replace function public.admin_engagement_overview(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
guard as (
  select case when public.current_user_is_admin() then 1
    else nullif(1, 1)::integer end as allowed
),
params as (
  select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as cutoff
),
job_cohort as (
  select j.*
    from public.jobs j, params p, guard g
   where g.allowed = 1 and j.created_at >= p.cutoff
),
provider_base as (
  select p.*
    from public.profiles p, guard g
   where g.allowed = 1
     and coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both')
),
active_work as (
  select 'job'::text as kind, j.id, j.created_at,
         ws.arrival_start_at, ws.arrival_end_at as expected_complete_at,
         ws.last_late_notice_at, ws.completion_prompted_at
    from public.jobs j
    left join public.work_schedules ws on ws.job_id = j.id
   where j.status in ('accepted', 'in_progress')
  union all
  select 'booking', b.id, b.created_at,
         ws.arrival_start_at, ws.arrival_end_at as expected_complete_at,
         ws.last_late_notice_at, ws.completion_prompted_at
    from public.bookings b
    left join public.work_schedules ws on ws.booking_id = b.id
   where b.status in ('confirmed', 'in_progress')
),
first_views as (
  select j.id, min(v.first_viewed_at) as happened_at
    from job_cohort j join public.job_provider_views v on v.job_id = j.id
   group by j.id
),
first_offers as (
  select j.id, min(b.created_at) as happened_at
    from job_cohort j join public.bids b on b.job_id = j.id
   group by j.id
),
category_coverage as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', q.category,
    'openJobs', q.open_jobs,
    'matchedJobs', q.matched_jobs
  ) order by q.open_jobs desc), '[]'::jsonb) as value
  from (
    select coalesce(j.category, 'Uncategorised') as category,
           count(distinct j.id)::integer as open_jobs,
           count(distinct c.job_id)::integer as matched_jobs
      from public.jobs j
      left join public.opportunity_candidates c on c.job_id = j.id
     where j.status = 'open'
     group by coalesce(j.category, 'Uncategorised')
  ) q
),
region_supply as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', q.region,
    'providers', q.providers,
    'available', q.available
  ) order by q.providers desc), '[]'::jsonb) as value
  from (
    select coalesce(nullif(trim(p.region), ''), 'Not supplied') as region,
           count(*)::integer as providers,
           count(*) filter (where public.provider_is_available(p))::integer as available
      from provider_base p
     group by coalesce(nullif(trim(p.region), ''), 'Not supplied')
  ) q
),
availability as (
  select coalesce(jsonb_agg(jsonb_build_object('name', q.name, 'value', q.value)
    order by q.value desc), '[]'::jsonb) as value
  from (
    select p.availability_status as name, count(*)::integer as value
      from provider_base p group by p.availability_status
  ) q
),
alert_modes as (
  select coalesce(jsonb_agg(jsonb_build_object('name', q.name, 'value', q.value)
    order by q.value desc), '[]'::jsonb) as value
  from (
    select coalesce(pref.opportunity_alert_mode, 'off') as name, count(*)::integer as value
      from provider_base p
      left join public.user_preferences pref on pref.user_id = p.id
     group by coalesce(pref.opportunity_alert_mode, 'off')
  ) q
),
email_statuses as (
  select coalesce(jsonb_agg(jsonb_build_object('name', q.name, 'value', q.value)
    order by q.value desc), '[]'::jsonb) as value
  from (
    select e.status as name, count(*)::integer as value
      from public.email_outbox e, params p
     where e.created_at >= p.cutoff
     group by e.status
  ) q
)
select case when (select allowed from guard) = 1 then jsonb_build_object(
  'funnel', jsonb_build_array(
    jsonb_build_object('name', 'Posted', 'value', (select count(*) from job_cohort)),
    jsonb_build_object('name', 'Matched', 'value', (select count(distinct m.job_id) from public.opportunity_matches m join job_cohort j on j.id = m.job_id)),
    jsonb_build_object('name', 'Viewed', 'value', (select count(distinct v.job_id) from public.job_provider_views v join job_cohort j on j.id = v.job_id)),
    jsonb_build_object('name', 'Offered', 'value', (select count(distinct b.job_id) from public.bids b join job_cohort j on j.id = b.job_id)),
    jsonb_build_object('name', 'Accepted', 'value', (select count(distinct b.job_id) from public.bids b join job_cohort j on j.id = b.job_id where b.status = 'accepted')),
    jsonb_build_object('name', 'Scheduled', 'value', (select count(distinct ws.job_id) from public.work_schedules ws join job_cohort j on j.id = ws.job_id)),
    jsonb_build_object('name', 'Completed', 'value', (select count(*) from job_cohort where status = 'completed'))
  ),
  'timing', jsonb_build_object(
    'medianHoursToFirstView', (select percentile_cont(0.5) within group (order by extract(epoch from (fv.happened_at - j.created_at)) / 3600) from first_views fv join job_cohort j on j.id = fv.id),
    'medianHoursToFirstOffer', (select percentile_cont(0.5) within group (order by extract(epoch from (fo.happened_at - j.created_at)) / 3600) from first_offers fo join job_cohort j on j.id = fo.id)
  ),
  'retention', jsonb_build_object(
    'repeatJobs', (select count(*) from job_cohort where repeated_from_job_id is not null),
    'repeatRate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where repeated_from_job_id is not null) / count(*), 1) end from job_cohort),
    'activeSavedInterests', (select count(*) from public.saved_interests where active),
    'savedInterestUsers', (select count(distinct user_id) from public.saved_interests where active),
    'savedInterestMatches', (select count(*) from public.saved_interest_matches m, params p where m.created_at >= p.cutoff),
    'instantInterests', (select count(*) from public.saved_interests where active and frequency = 'instant'),
    'dailyInterests', (select count(*) from public.saved_interests where active and frequency = 'daily'),
    'pausedInterests', (select count(*) from public.saved_interests where not active or frequency = 'off')
  ),
  'listing', jsonb_build_object(
    'openJobs', (select count(*) from public.jobs where status = 'open'),
    'noViews48h', (select count(*) from public.jobs j where j.status = 'open' and j.created_at < now() - interval '48 hours' and not exists (select 1 from public.job_provider_views v where v.job_id = j.id)),
    'viewedNoOffers48h', (select count(*) from public.jobs j where j.status = 'open' and j.created_at < now() - interval '48 hours' and exists (select 1 from public.job_provider_views v where v.job_id = j.id) and not exists (select 1 from public.bids b where b.job_id = j.id)),
    'zeroMatches', (select count(*) from public.jobs j where j.status = 'open' and not exists (select 1 from public.opportunity_candidates c where c.job_id = j.id)),
    'missingPhotos', (select count(*) from public.jobs j where j.status = 'open' and coalesce(cardinality(j.photos), 0) = 0),
    'openBudgets', (select count(*) from public.jobs j where j.status = 'open' and j.price_type = 'open'),
    'shortDescriptions', (select count(*) from public.jobs j where j.status = 'open' and array_length(regexp_split_to_array(trim(coalesce(j.description, '')), '\s+'), 1) < 25)
  ),
  'providers', jsonb_build_object(
    'total', (select count(*) from provider_base),
    'available', (select count(*) from provider_base p where public.provider_is_available(p)),
    'staleAvailability', (select count(*) from provider_base p where p.availability_updated_at is null or p.availability_updated_at < now() - interval '14 days'),
    'alertOptIn', (select count(*) from provider_base p join public.user_preferences pref on pref.user_id = p.id where pref.opportunity_alert_mode in ('instant', 'daily')),
    'zeroMatchOpenJobs', (select count(*) from public.jobs j where j.status = 'open' and not exists (select 1 from public.opportunity_candidates c where c.job_id = j.id)),
    'availability', (select value from availability),
    'alertModes', (select value from alert_modes),
    'categoryCoverage', (select value from category_coverage),
    'regionSupply', (select value from region_supply)
  ),
  'coordination', jsonb_build_object(
    'activeWork', (select count(*) from active_work),
    'scheduledWork', (select count(*) from active_work where arrival_start_at is not null),
    'unscheduledWork', (select count(*) from active_work where arrival_start_at is null),
    'upcomingToday', (select count(*) from active_work where arrival_start_at >= date_trunc('day', now() at time zone 'Pacific/Auckland') at time zone 'Pacific/Auckland' and arrival_start_at < (date_trunc('day', now() at time zone 'Pacific/Auckland') + interval '1 day') at time zone 'Pacific/Auckland'),
    'upcomingWeek', (select count(*) from active_work where arrival_start_at >= now() and arrival_start_at < now() + interval '7 days'),
    'overdue', (select count(*) from active_work where expected_complete_at < now()),
    'lateNotices', (select count(*) from public.work_schedules ws, params p where ws.last_late_notice_at >= p.cutoff),
    'completionPrompts', (select count(*) from public.work_schedules ws, params p where ws.completion_prompted_at >= p.cutoff)
  ),
  'delivery', jsonb_build_object(
    'failedEmails', (select count(*) from public.email_outbox e, params p where e.status = 'failed' and e.created_at >= p.cutoff),
    'pendingEmails', (select count(*) from public.email_outbox e where e.status = 'pending' and e.scheduled_for < now() - interval '15 minutes'),
    'emailStatuses', (select value from email_statuses)
  )
) else null end;
$$;

revoke all on function public.admin_engagement_overview(integer) from public, anon;
grant execute on function public.admin_engagement_overview(integer) to authenticated;

create or replace function public.admin_operations_queue(p_limit integer default 250)
returns table (
  queue_id text,
  record_type text,
  record_id uuid,
  issue_code text,
  severity text,
  title text,
  category text,
  location text,
  status text,
  age_hours numeric,
  provider_views integer,
  matching_providers integer,
  offers integer,
  expected_complete_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
with
open_job_facts as (
  select j.*,
         (select count(*)::integer from public.job_provider_views v where v.job_id = j.id) as views,
         (select count(*)::integer from public.opportunity_candidates c where c.job_id = j.id) as matches,
         (select count(*)::integer from public.bids b where b.job_id = j.id and b.status <> 'rejected') as bid_count,
         extract(epoch from (now() - j.created_at)) / 3600 as hours_open
    from public.jobs j
   where j.status = 'open'
),
issues as (
  select concat('job:', j.id, ':no_views') as queue_id, 'job'::text as record_type,
         j.id as record_id, 'no_views'::text as issue_code,
         case when j.hours_open >= 96 then 'high' else 'medium' end as severity,
         j.title, j.category, j.location_name as location, j.status,
         j.hours_open as age_hours, j.views as provider_views,
         j.matches as matching_providers, j.bid_count as offers,
         null::timestamptz as expected_complete_at, j.created_at
    from open_job_facts j
   where j.hours_open >= 48 and j.views = 0
  union all
  select concat('job:', j.id, ':views_no_offers'), 'job', j.id, 'views_no_offers',
         case when j.hours_open >= 96 then 'high' else 'medium' end,
         j.title, j.category, j.location_name, j.status, j.hours_open,
         j.views, j.matches, j.bid_count, null::timestamptz, j.created_at
    from open_job_facts j
   where j.hours_open >= 48 and j.views > 0 and j.bid_count = 0
  union all
  select concat('job:', j.id, ':zero_matches'), 'job', j.id, 'zero_matches',
         case when j.hours_open >= 48 then 'high' else 'medium' end,
         j.title, j.category, j.location_name, j.status, j.hours_open,
         j.views, j.matches, j.bid_count, null::timestamptz, j.created_at
    from open_job_facts j
   where j.hours_open >= 24 and j.matches = 0
  union all
  select concat('job:', j.id, ':unscheduled'), 'job', j.id, 'unscheduled',
         case when j.created_at < now() - interval '48 hours' then 'high' else 'medium' end,
         j.title, j.category, j.location_name, j.status,
         extract(epoch from (now() - j.created_at)) / 3600,
         0, 0, 0, null::timestamptz, j.created_at
    from public.jobs j
   where j.status in ('accepted', 'in_progress')
     and not exists (select 1 from public.work_schedules ws where ws.job_id = j.id)
  union all
  select concat('booking:', b.id, ':unscheduled'), 'booking', b.id, 'unscheduled',
         case when b.created_at < now() - interval '48 hours' then 'high' else 'medium' end,
         coalesce(s.title, 'Service booking'), s.category, b.location_name, b.status,
         extract(epoch from (now() - b.created_at)) / 3600,
         0, 0, 0, null::timestamptz, b.created_at
    from public.bookings b
    left join public.services s on s.id = b.service_id
   where b.status in ('confirmed', 'in_progress')
     and not exists (select 1 from public.work_schedules ws where ws.booking_id = b.id)
  union all
  select concat(coalesce('job:' || ws.job_id::text, 'booking:' || ws.booking_id::text), ':overdue'),
         case when ws.job_id is not null then 'job' else 'booking' end,
         coalesce(ws.job_id, ws.booking_id), 'overdue', 'high',
         coalesce(j.title, s.title, 'Confirmed work'),
         coalesce(j.category, s.category),
         coalesce(j.location_name, b.location_name),
         coalesce(j.status, b.status),
         extract(epoch from (now() - ws.arrival_end_at)) / 3600,
         0, 0, 0, ws.arrival_end_at, ws.created_at
    from public.work_schedules ws
    left join public.jobs j on j.id = ws.job_id
    left join public.bookings b on b.id = ws.booking_id
    left join public.services s on s.id = b.service_id
   where ws.arrival_end_at < now()
     and ((j.id is not null and j.status in ('accepted', 'in_progress'))
       or (b.id is not null and b.status in ('confirmed', 'in_progress')))
)
select i.*
  from issues i
 where public.current_user_is_admin()
 order by case i.severity when 'high' then 0 else 1 end, i.age_hours desc
 limit greatest(1, least(coalesce(p_limit, 250), 500));
$$;

revoke all on function public.admin_operations_queue(integer) from public, anon;
grant execute on function public.admin_operations_queue(integer) to authenticated;
