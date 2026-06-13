-- Notification triggers for DIFM Rural — closes the requester↔provider loop.
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- This file is the single source of truth for ALL notification triggers
-- (it supersedes the notify functions in security_hardening.sql).
--
-- Design rule: a notification failure must NEVER block the underlying
-- action, so every function traps and swallows its own errors.

-- ────────────────────────────────────────────────────────────────────────────
-- Schema guard: older databases created the notifications table without
-- these columns (create table if not exists does not add columns).
-- ────────────────────────────────────────────────────────────────────────────

alter table public.notifications
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists read boolean default false,
  add column if not exists created_at timestamptz default now();

-- ────────────────────────────────────────────────────────────────────────────
-- Job Q&A (supersedes the security_hardening.sql versions)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_new_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_owner uuid;
begin
  select title, requester_id into v_title, v_owner from jobs where id = new.job_id;
  if v_owner is not null and v_owner <> new.asker_id then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_owner,
      'new_question',
      format('New question on your job "%s"', coalesce(v_title, 'your job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists job_questions_notify_new on public.job_questions;
create trigger job_questions_notify_new
  after insert on public.job_questions
  for each row execute function public.notify_new_question();

create or replace function public.notify_question_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from jobs where id = new.job_id;
  insert into notifications (user_id, type, body, metadata)
  values (
    new.asker_id,
    'question_answered',
    format('Your question on "%s" has been answered', coalesce(v_title, 'a job')),
    jsonb_build_object('job_id', new.job_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists job_questions_notify_answered on public.job_questions;
create trigger job_questions_notify_answered
  after update on public.job_questions
  for each row
  when (new.answer is not null and new.answer is distinct from old.answer)
  execute function public.notify_question_answered();

-- ────────────────────────────────────────────────────────────────────────────
-- Bids
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_bid_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_owner uuid;
begin
  select title, requester_id into v_title, v_owner from jobs where id = new.job_id;
  if v_owner is not null and v_owner <> new.provider_id then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_owner,
      'new_bid',
      format('New bid of $%s NZD on "%s"', new.amount::text, coalesce(v_title, 'your job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists bids_notify_placed on public.bids;
create trigger bids_notify_placed
  after insert on public.bids
  for each row execute function public.notify_bid_placed();

create or replace function public.notify_bid_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from jobs where id = new.job_id;

  if new.status = 'accepted' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_accepted',
      format('You got the job! Your bid of $%s NZD on "%s" was accepted.', new.amount::text, coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_rejected',
      format('Your bid on "%s" was not selected this time.', coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists bids_notify_status_change on public.bids;
create trigger bids_notify_status_change
  after update on public.bids
  for each row execute function public.notify_bid_status_change();

-- ────────────────────────────────────────────────────────────────────────────
-- Jobs: cancellation after award + completion
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select provider_id into v_provider
  from bids
  where job_id = new.id and status = 'accepted'
  limit 1;

  if v_provider is null then
    return new;
  end if;

  if new.status = 'cancelled' and old.status in ('accepted', 'in_progress') then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_cancelled',
      format('The job "%s" has been cancelled by the requester.', coalesce(new.title, 'a job')),
      jsonb_build_object('job_id', new.id)
    );
  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_completed',
      format('"%s" has been confirmed complete. You can now review the requester.', coalesce(new.title, 'A job')),
      jsonb_build_object('job_id', new.id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists jobs_notify_status_change on public.jobs;
create trigger jobs_notify_status_change
  after update on public.jobs
  for each row execute function public.notify_job_status_change();

-- ────────────────────────────────────────────────────────────────────────────
-- Bookings: new booking request (INSERT)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_quote boolean;
begin
  select title, pricing_type = 'quote_required' into v_title, v_quote
  from services where id = new.service_id;
  v_title := coalesce(v_title, 'your service');

  insert into notifications (user_id, type, body, metadata)
  values (
    new.provider_id,
    'new_booking',
    case when coalesce(v_quote, false)
      then format('Quote requested for "%s". Review and send a quote.', v_title)
      else format('New booking request for "%s". Confirm or decline.', v_title)
    end,
    jsonb_build_object('booking_id', new.id, 'service_id', new.service_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists bookings_notify_created on public.bookings;
create trigger bookings_notify_created
  after insert on public.bookings
  for each row execute function public.notify_booking_created();

-- ────────────────────────────────────────────────────────────────────────────
-- Bookings: full status coverage
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from services where id = new.service_id;
  v_title := coalesce(v_title, 'your service booking');

  if new.status = 'quote_sent' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'service_quote_sent',
      format('A quote has been sent for "%s".', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'confirmed' and old.status = 'quote_sent' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'service_quote_accepted',
      format('Your quote for "%s" has been accepted.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'confirmed' and old.status = 'pending' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_confirmed',
      format('Your booking for "%s" has been confirmed by the provider.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status in ('declined', 'cancelled') and old.status in ('pending', 'quote_sent') then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_declined',
      format('Your booking request for "%s" was declined.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'cancelled' and old.status = 'cancellation_requested' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_cancelled',
      format('Your cancellation of "%s" has been confirmed.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'withdrawn' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'service_booking_withdrawn',
      format('A service request for "%s" has been withdrawn.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'awaiting_completion' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_ready',
      format('The provider says "%s" is complete. Please confirm.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'booking_completed',
      format('"%s" has been confirmed complete. You can now review the requester.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'cancellation_requested' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'booking_cancellation_requested',
      format('The requester has asked to cancel "%s". Please confirm.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists bookings_notify_status_change on public.bookings;
create trigger bookings_notify_status_change
  after update on public.bookings
  for each row execute function public.notify_booking_status_change();
