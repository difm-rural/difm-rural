-- Seasonal reminder cards on Home get their own Account setting, and a
-- dismissed card comes back after 60 days.
--
-- * user_preferences.seasonal_cards (default on) switches the in-app cards.
--   It is separate from email_seasonal, which stays opt-in (promotional
--   emails need consent; Home cards don't).
-- * A dismissal now hides a card for 60 days rather than for good. Dismissing
--   it again restarts the 60 days (record_seasonal_campaign_event sets
--   dismissed_at = now() on every dismiss).
-- get_my_seasonal_campaigns is otherwise the same as the live definition.

alter table public.user_preferences
  add column if not exists seasonal_cards boolean not null default true;

create or replace function public.get_my_seasonal_campaigns()
 returns table(id uuid, title text, body text, category text, capability text, primary_action text, priority integer, starts_on date, ends_on date)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- The person's own switch (no preferences row yet = on).
  if exists (
    select 1 from public.user_preferences u
     where u.user_id = v_user_id and u.seasonal_cards = false
  ) then return; end if;

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
       -- Dismissed cards come back after 60 days.
       and (d.dismissed_at is null or d.dismissed_at < now() - interval '60 days')
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
$function$;
