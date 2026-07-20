-- User-facing delivery for seasonal reminder campaigns.
--
-- In-app eligibility is resolved server-side so audience, region, dismissal,
-- and monthly caps cannot drift between clients. Seasonal email is explicit
-- opt-in and reuses the durable email_outbox worker.

alter table public.user_preferences
  add column if not exists email_seasonal boolean not null default false;

create table if not exists public.seasonal_campaign_deliveries (
  campaign_id          uuid not null references public.seasonal_campaigns(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  first_impression_at  timestamptz,
  last_impression_at   timestamptz,
  impression_count     integer not null default 0 check (impression_count >= 0),
  dismissed_at         timestamptz,
  actioned_at          timestamptz,
  email_queued_at      timestamptz,
  email_sent_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists seasonal_deliveries_user_idx
  on public.seasonal_campaign_deliveries (user_id, first_impression_at desc);

alter table public.seasonal_campaign_deliveries enable row level security;

drop policy if exists "Users read own seasonal deliveries" on public.seasonal_campaign_deliveries;
create policy "Users read own seasonal deliveries"
  on public.seasonal_campaign_deliveries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins read seasonal deliveries" on public.seasonal_campaign_deliveries;
create policy "Admins read seasonal deliveries"
  on public.seasonal_campaign_deliveries for select to authenticated
  using (public.current_user_is_admin());

grant select on public.seasonal_campaign_deliveries to authenticated;
grant all on public.seasonal_campaign_deliveries to service_role;

-- The existing outbox can now carry either a transactional notification or a
-- seasonal campaign. Each campaign is queued at most once for each user.
alter table public.email_outbox
  alter column notification_id drop not null,
  add column if not exists campaign_id uuid references public.seasonal_campaigns(id) on delete cascade;

alter table public.email_outbox
  drop constraint if exists email_outbox_source_check;
alter table public.email_outbox
  add constraint email_outbox_source_check
  check (num_nonnulls(notification_id, campaign_id) = 1);

create unique index if not exists email_outbox_campaign_user_unique
  on public.email_outbox (campaign_id, user_id)
  where campaign_id is not null;

create or replace function public.get_my_seasonal_campaigns()
returns table (
  id uuid,
  title text,
  body text,
  category text,
  capability text,
  primary_action text,
  priority integer,
  starts_on date,
  ends_on date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_region text;
  v_enabled boolean;
  v_max integer;
  v_shown integer;
  v_remaining integer;
begin
  if v_user_id is null then return; end if;

  select coalesce(p.primary_role, p.role, 'requester'), p.region
    into v_role, v_region
    from public.profiles p
   where p.id = v_user_id;

  select s.in_app_enabled, s.max_cards_per_month
    into v_enabled, v_max
    from public.seasonal_reminder_settings s
   where s.singleton = true;

  if not coalesce(v_enabled, false) or coalesce(v_max, 0) = 0 then return; end if;

  select count(*)::integer
    into v_shown
    from public.seasonal_campaign_deliveries d
   where d.user_id = v_user_id
     and d.first_impression_at >= date_trunc('month', now());
  v_remaining := greatest(v_max - coalesce(v_shown, 0), 0);

  return query
  with eligible as (
    select c.*, d.first_impression_at,
           row_number() over (
             partition by (d.first_impression_at is null)
             order by c.priority desc, c.starts_on asc, c.id
           ) as group_rank
      from public.seasonal_campaigns c
      left join public.seasonal_campaign_deliveries d
        on d.campaign_id = c.id and d.user_id = v_user_id
     where c.is_active
       and c.in_app_enabled
       and current_date between c.starts_on and c.ends_on
       and d.dismissed_at is null
       and (
         c.audience = 'both'
         or (c.audience = 'requester' and v_role in ('requester', 'both'))
         or (c.audience = 'provider' and v_role in ('provider', 'both'))
       )
       and (
         cardinality(c.regions) = 0
         or exists (
           select 1 from unnest(c.regions) target_region
            where lower(trim(target_region)) = lower(trim(coalesce(v_region, '')))
         )
       )
  )
  select e.id, e.title, e.body, e.category, e.capability,
         e.primary_action, e.priority, e.starts_on, e.ends_on
    from eligible e
   where e.first_impression_at is not null
      or (e.first_impression_at is null and e.group_rank <= v_remaining)
   order by e.priority desc, e.starts_on asc
   limit v_max;
end;
$$;

revoke all on function public.get_my_seasonal_campaigns() from public;
grant execute on function public.get_my_seasonal_campaigns() to authenticated;

create or replace function public.record_seasonal_campaign_event(
  p_campaign_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_event not in ('impression', 'dismiss', 'action') then
    raise exception 'Unsupported seasonal campaign event';
  end if;

  if not exists (
    select 1 from public.seasonal_campaigns c
     where c.id = p_campaign_id
       and c.is_active
       and c.in_app_enabled
       and current_date between c.starts_on and c.ends_on
  ) then
    return;
  end if;

  insert into public.seasonal_campaign_deliveries (
    campaign_id, user_id, first_impression_at, last_impression_at,
    impression_count, dismissed_at, actioned_at
  ) values (
    p_campaign_id, v_user_id,
    case when p_event = 'impression' then now() end,
    case when p_event = 'impression' then now() end,
    case when p_event = 'impression' then 1 else 0 end,
    case when p_event = 'dismiss' then now() end,
    case when p_event = 'action' then now() end
  )
  on conflict (campaign_id, user_id) do update set
    first_impression_at = case
      when p_event = 'impression' then coalesce(seasonal_campaign_deliveries.first_impression_at, now())
      else seasonal_campaign_deliveries.first_impression_at end,
    last_impression_at = case
      when p_event = 'impression' then now()
      else seasonal_campaign_deliveries.last_impression_at end,
    impression_count = seasonal_campaign_deliveries.impression_count
      + case when p_event = 'impression' then 1 else 0 end,
    dismissed_at = case
      when p_event = 'dismiss' then now()
      else seasonal_campaign_deliveries.dismissed_at end,
    actioned_at = case
      when p_event = 'action' then now()
      else seasonal_campaign_deliveries.actioned_at end,
    updated_at = now();
end;
$$;

revoke all on function public.record_seasonal_campaign_event(uuid, text) from public;
grant execute on function public.record_seasonal_campaign_event(uuid, text) to authenticated;

-- Called by pg_cron once each morning. Only explicitly opted-in users who
-- match the campaign audience and exact profile region are considered.
create or replace function public.queue_due_seasonal_campaign_emails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queued integer := 0;
begin
  if not coalesce((
    select email_enabled from public.seasonal_reminder_settings where singleton = true
  ), false) then
    return 0;
  end if;

  with candidates as (
    select c.id as campaign_id, p.id as user_id,
           row_number() over (
             partition by p.id order by c.priority desc, c.starts_on asc, c.id
           ) as campaign_rank,
           greatest(s.max_emails_per_month - (
             select count(*)::integer
               from public.email_outbox eo
              where eo.user_id = p.id
                and eo.email_type = 'seasonal_reminder'
                and eo.created_at >= date_trunc('month', now())
                and eo.status not in ('cancelled', 'failed')
           ), 0) as remaining
      from public.seasonal_campaigns c
      cross join public.seasonal_reminder_settings s
      join public.profiles p on true
      join public.user_preferences pref on pref.user_id = p.id
     where s.singleton = true
       and s.email_enabled
       and s.max_emails_per_month > 0
       and pref.email_seasonal
       and c.is_active
       and c.email_enabled
       and current_date between c.starts_on and c.ends_on
       and (
         c.audience = 'both'
         or (c.audience = 'requester' and coalesce(p.primary_role, p.role, 'requester') in ('requester', 'both'))
         or (c.audience = 'provider' and coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both'))
       )
       and (
         cardinality(c.regions) = 0
         or exists (
           select 1 from unnest(c.regions) target_region
            where lower(trim(target_region)) = lower(trim(coalesce(p.region, '')))
         )
       )
       and not exists (
         select 1 from public.email_outbox existing
          where existing.campaign_id = c.id and existing.user_id = p.id
       )
  ), inserted as (
    insert into public.email_outbox (
      user_id, campaign_id, email_type, scheduled_for
    )
    select user_id, campaign_id, 'seasonal_reminder', now()
      from candidates
     where campaign_rank <= remaining
    on conflict do nothing
    returning campaign_id, user_id
  )
  insert into public.seasonal_campaign_deliveries (
    campaign_id, user_id, email_queued_at
  )
  select campaign_id, user_id, now() from inserted
  on conflict (campaign_id, user_id) do update
    set email_queued_at = excluded.email_queued_at, updated_at = now();

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

revoke all on function public.queue_due_seasonal_campaign_emails() from public;
grant execute on function public.queue_due_seasonal_campaign_emails() to service_role;

-- 20:00 UTC is 08:00 NZST / 09:00 NZDT. The queue is idempotent, so replacing
-- this schedule is safe if the migration is replayed during development.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-seasonal-campaign-emails';

select cron.schedule(
  'queue-seasonal-campaign-emails',
  '0 20 * * *',
  $$select public.queue_due_seasonal_campaign_emails();$$
);

