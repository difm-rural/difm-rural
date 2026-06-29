-- Opt-in flag for the daily summary push (see functions/daily-digest).
-- Off by default; users turn it on from Account → App → Daily summary.
alter table public.user_preferences
  add column if not exists daily_digest boolean not null default false;
