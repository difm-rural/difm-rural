-- Transactional email preferences and durable delivery outbox.
--
-- Notification triggers remain the single source of truth. This migration
-- queues selected notification types for email; a scheduled Edge Function
-- claims and delivers due rows. Chat email is delayed so it can be cancelled
-- when the recipient reads the in-app notification first.

alter table public.user_preferences
  add column if not exists email_transactional boolean not null default true,
  add column if not exists email_messages boolean not null default true;

create table if not exists public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  notification_id     uuid not null references public.notifications(id) on delete cascade,
  email_type          text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts            integer not null default 0,
  scheduled_for       timestamptz not null default now(),
  sent_at             timestamptz,
  provider_message_id text,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (notification_id)
);

create index if not exists email_outbox_due_idx
  on public.email_outbox (scheduled_for, created_at)
  where status = 'pending';

create index if not exists email_outbox_user_idx
  on public.email_outbox (user_id, created_at desc);

alter table public.email_outbox enable row level security;

-- The mobile clients never read or write delivery internals. Edge Functions
-- use the service role, which bypasses RLS.
revoke all on public.email_outbox from anon, authenticated;
grant all on public.email_outbox to service_role;

create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transactional boolean := true;
  v_messages      boolean := true;
  v_send_at       timestamptz := now();
begin
  -- Transactional email is intentionally restricted to events where the user
  -- needs to know or act. Engagement/marketing email is not queued here.
  if new.type not in (
    'new_bid', 'new_booking', 'new_job_invite', 'new_question',
    'question_answered', 'bid_accepted', 'job_cancelled', 'job_ready',
    'job_completed', 'service_quote_sent', 'service_quote_accepted',
    'booking_confirmed', 'booking_declined', 'booking_cancelled',
    'service_booking_withdrawn', 'booking_ready', 'booking_completed',
    'booking_cancellation_requested', 'new_message'
  ) then
    return new;
  end if;

  select p.email_transactional, p.email_messages
    into v_transactional, v_messages
    from public.user_preferences p
   where p.user_id = new.user_id;

  -- SELECT INTO sets values to null when no preference row exists; new users
  -- default on for essential activity email.
  v_transactional := coalesce(v_transactional, true);
  v_messages      := coalesce(v_messages, true);

  if new.type = 'new_message' then
    if not v_messages then return new; end if;
    v_send_at := now() + interval '20 minutes';
  elsif not v_transactional then
    return new;
  end if;

  insert into public.email_outbox (
    user_id, notification_id, email_type, scheduled_for
  ) values (
    new.user_id, new.id, new.type, v_send_at
  ) on conflict (notification_id) do nothing;

  return new;
exception when others then
  -- Email queueing must never block the underlying marketplace action.
  raise warning 'Could not enqueue notification email %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.enqueue_notification_email();

