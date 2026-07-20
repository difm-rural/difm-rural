-- Admin-managed seasonal rural reminder campaigns.
-- Campaigns are safe-by-default: seeded examples are paused, email/push are
-- globally disabled, and only admins can create or change campaign data.

create table if not exists public.seasonal_reminder_settings (
  singleton             boolean primary key default true check (singleton),
  in_app_enabled        boolean not null default true,
  email_enabled         boolean not null default false,
  push_enabled          boolean not null default false,
  weather_enabled       boolean not null default false,
  max_cards_per_month   integer not null default 2 check (max_cards_per_month between 0 and 10),
  max_emails_per_month  integer not null default 1 check (max_emails_per_month between 0 and 5),
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now()
);

insert into public.seasonal_reminder_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.seasonal_campaigns (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null check (char_length(title) between 3 and 100),
  body            text not null check (char_length(body) between 3 and 300),
  category        text,
  capability      text,
  audience        text not null default 'requester'
                    check (audience in ('requester', 'provider', 'both')),
  regions         text[] not null default '{}',
  starts_on       date not null,
  ends_on         date not null check (ends_on >= starts_on),
  primary_action  text not null default 'post_job'
                    check (primary_action in ('post_job', 'browse_services', 'manage_profile', 'none')),
  in_app_enabled  boolean not null default true,
  email_enabled   boolean not null default false,
  push_enabled    boolean not null default false,
  priority        integer not null default 20 check (priority between 0 and 100),
  is_active       boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists seasonal_campaigns_delivery_idx
  on public.seasonal_campaigns (is_active, starts_on, ends_on, priority desc);

alter table public.seasonal_reminder_settings enable row level security;
alter table public.seasonal_campaigns enable row level security;

drop policy if exists "Authenticated users can read seasonal settings" on public.seasonal_reminder_settings;
create policy "Authenticated users can read seasonal settings"
  on public.seasonal_reminder_settings for select to authenticated
  using (true);

drop policy if exists "Admins manage seasonal settings" on public.seasonal_reminder_settings;
create policy "Admins manage seasonal settings"
  on public.seasonal_reminder_settings for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Users only see campaigns currently eligible for in-app delivery. Admins see
-- all drafts, paused, future, and expired campaigns through the second policy.
drop policy if exists "Users can read live seasonal campaigns" on public.seasonal_campaigns;
create policy "Users can read live seasonal campaigns"
  on public.seasonal_campaigns for select to authenticated
  using (
    is_active
    and in_app_enabled
    and current_date between starts_on and ends_on
  );

drop policy if exists "Admins manage seasonal campaigns" on public.seasonal_campaigns;
create policy "Admins manage seasonal campaigns"
  on public.seasonal_campaigns for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select, insert, update, delete on public.seasonal_reminder_settings to authenticated;
grant select, insert, update, delete on public.seasonal_campaigns to authenticated;

create or replace function public.set_seasonal_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists seasonal_settings_updated_at on public.seasonal_reminder_settings;
create trigger seasonal_settings_updated_at
  before update on public.seasonal_reminder_settings
  for each row execute function public.set_seasonal_updated_at();

drop trigger if exists seasonal_campaigns_updated_at on public.seasonal_campaigns;
create trigger seasonal_campaigns_updated_at
  before update on public.seasonal_campaigns
  for each row execute function public.set_seasonal_updated_at();

-- Starter campaigns are drafts. An admin reviews targeting, wording and dates
-- before activating any of them.
insert into public.seasonal_campaigns
  (slug, title, body, category, capability, audience, starts_on, ends_on, primary_action, priority)
values
  ('spring-maintenance-2026',
   'Get ready for spring maintenance',
   'Plan fencing, pasture and vegetation work before the busy spring period.',
   'Land & Vegetation', null, 'requester', '2026-09-01', '2026-10-31', 'post_job', 20),
  ('summer-water-2026',
   'Prepare your water system for summer',
   'Check tanks, troughs, pumps and water lines before dry weather arrives.',
   'Water & Drainage', 'Trough installation and repairs', 'requester', '2026-11-01', '2026-12-20', 'post_job', 30),
  ('holiday-care-2026',
   'Arrange holiday property and animal care',
   'Book trusted help early for house sitting, property checks and animal care.',
   'Property & House Sitting', 'Holiday property care', 'requester', '2026-11-01', '2026-12-15', 'browse_services', 40),
  ('autumn-access-2027',
   'Prepare access and drainage before winter',
   'Check drains, culverts, tracks and driveways before wetter weather arrives.',
   'Earthworks & Driveways', 'Driveway grading and repairs', 'requester', '2027-03-01', '2027-04-30', 'post_job', 20)
on conflict (slug) do nothing;
