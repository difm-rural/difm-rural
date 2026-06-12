-- Security hardening for DIFM Rural.
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- 1. Notifications: clients can no longer insert notifications directly
--    (any user could previously notify any other user with arbitrary text).
--    They are now created by database triggers, so the body text is
--    server-controlled. The app's old fire-and-forget inserts have been
--    removed from the client code.
-- 2. job-photos storage: update/delete now require ownership of the object
--    (previously any authenticated user could overwrite/delete any photo).
-- 3. Bookings: a trigger enforces which columns each party may change and
--    which status transitions are legal (previously either participant
--    could set any column to anything, e.g. rewrite total_amount or jump
--    status straight to completed).
-- 4. Reviews: readable by everyone so ratings show on provider profiles
--    and service cards (previously only reviewer/reviewee could read them,
--    so third parties always saw zero reviews).
-- 5. Job Q&A: the job owner can only fill in answer/answered_at when
--    answering (previously the update policy let the owner rewrite the
--    asker's question text).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Notifications
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can create notifications" on public.notifications;

-- New question on a job → notify the job owner
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
end;
$$;

drop trigger if exists job_questions_notify_new on public.job_questions;
create trigger job_questions_notify_new
  after insert on public.job_questions
  for each row execute function public.notify_new_question();

-- Question answered → notify the asker
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
end;
$$;

drop trigger if exists job_questions_notify_answered on public.job_questions;
create trigger job_questions_notify_answered
  after update on public.job_questions
  for each row
  when (new.answer is not null and new.answer is distinct from old.answer)
  execute function public.notify_question_answered();

-- Booking status changes → notify the counterpart
-- (mirrors the notifications the app used to insert client-side)
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

  if new.status = 'quote_sent' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.requester_id,
      'service_quote_sent',
      format('A quote has been sent for "%s".', coalesce(v_title, 'your service booking')),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id, 'provider_id', new.provider_id)
    );
  elsif old.status = 'quote_sent' and new.status = 'confirmed' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'service_quote_accepted',
      format('Your quote for "%s" has been accepted.', coalesce(v_title, 'a service booking')),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id, 'requester_id', new.requester_id)
    );
  elsif new.status = 'withdrawn' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'service_booking_withdrawn',
      format('A service request for "%s" has been withdrawn.', coalesce(v_title, 'your service')),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id, 'requester_id', new.requester_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_notify_status_change on public.bookings;
create trigger bookings_notify_status_change
  after update on public.bookings
  for each row execute function public.notify_booking_status_change();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. job-photos storage: ownership required for update/delete
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "authenticated users can update job photos" on storage.objects;
drop policy if exists "authenticated users can delete job photos" on storage.objects;
drop policy if exists "owners can update their job photos" on storage.objects;
drop policy if exists "owners can delete their job photos" on storage.objects;

create policy "owners can update their job photos"
on storage.objects for update
using (bucket_id = 'job-photos' and owner = auth.uid())
with check (bucket_id = 'job-photos' and owner = auth.uid());

create policy "owners can delete their job photos"
on storage.objects for delete
using (bucket_id = 'job-photos' and owner = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Bookings: column- and transition-level rules
-- ────────────────────────────────────────────────────────────────────────────

-- These columns are referenced below; older databases may not have them yet.
alter table public.bookings
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text,
  add column if not exists provider_archive_at timestamptz;

-- New bookings must start at 'pending' (the app always inserts 'pending').
drop policy if exists "Requesters can create their own bookings" on public.bookings;
create policy "Requesters can create their own bookings"
on public.bookings
for insert
to authenticated
with check (auth.uid() = requester_id and status = 'pending');

create or replace function public.enforce_booking_update_rules()
returns trigger
language plpgsql
as $$
declare
  actor uuid := auth.uid();
  is_provider boolean;
  is_requester boolean;
  status_changed boolean := new.status is distinct from old.status;
  transition_ok boolean := false;
begin
  -- Service-role / SQL-editor sessions are not subject to these rules.
  if actor is null then
    return new;
  end if;

  is_provider  := actor = old.provider_id;
  is_requester := actor = old.requester_id;

  -- Fixed at creation time, nobody may change them.
  if new.service_id     is distinct from old.service_id
     or new.requester_id is distinct from old.requester_id
     or new.provider_id  is distinct from old.provider_id
     or new.created_at   is distinct from old.created_at
     or new.payment_timing is distinct from old.payment_timing
     or new.quantity      is distinct from old.quantity
     or new.scheduled_date is distinct from old.scheduled_date
     or new.location_name  is distinct from old.location_name
     or new.latitude       is distinct from old.latitude
     or new.longitude      is distinct from old.longitude
     or new.location_note  is distinct from old.location_note
     or new.notes          is distinct from old.notes
  then
    raise exception 'This booking field cannot be changed after creation';
  end if;

  -- Quote and money fields: only the provider, and only while sending a quote.
  if new.quote_amount   is distinct from old.quote_amount
     or new.quote_notes   is distinct from old.quote_notes
     or new.quote_sent_at is distinct from old.quote_sent_at
     or new.total_amount  is distinct from old.total_amount
  then
    if not (is_provider and new.status = 'quote_sent') then
      raise exception 'Quote and amount fields can only be set by the provider when sending a quote';
    end if;
  end if;

  -- Quote acceptance: only the requester, only when accepting a sent quote.
  if new.quote_accepted_at is distinct from old.quote_accepted_at then
    if not (is_requester and old.status = 'quote_sent' and new.status = 'confirmed') then
      raise exception 'Only the requester can accept a quote';
    end if;
  end if;

  -- Cancellation details: only the requester, only while cancelling.
  if new.cancellation_reason is distinct from old.cancellation_reason
     or new.cancellation_note is distinct from old.cancellation_note
  then
    if not (is_requester and new.status in ('withdrawn', 'cancellation_requested')) then
      raise exception 'Cancellation details can only be set by the requester when cancelling';
    end if;
  end if;

  -- Archiving: only the provider, on finished bookings, without a status change.
  if new.provider_archive_at is distinct from old.provider_archive_at then
    if not (is_provider and not status_changed and old.status in ('withdrawn', 'cancelled')) then
      raise exception 'Only the provider can archive a withdrawn or cancelled booking';
    end if;
  end if;

  if status_changed then
    if is_provider then
      transition_ok :=
           (old.status = 'pending'                and new.status in ('confirmed', 'declined', 'cancelled', 'quote_sent'))
        or (old.status = 'quote_sent'             and new.status in ('declined', 'cancelled'))
        or (old.status = 'confirmed'              and new.status in ('in_progress', 'awaiting_completion', 'quote_sent'))
        or (old.status = 'in_progress'            and new.status = 'awaiting_completion')
        or (old.status = 'cancellation_requested' and new.status = 'cancelled');
    end if;

    if not transition_ok and is_requester then
      transition_ok :=
           (old.status in ('pending', 'quote_sent') and new.status = 'withdrawn')
        or (old.status = 'quote_sent'               and new.status = 'confirmed')
        or (old.status in ('confirmed', 'in_progress', 'awaiting_completion') and new.status = 'cancellation_requested')
        or (old.status = 'awaiting_completion'      and new.status = 'completed');
    end if;

    if not transition_ok then
      raise exception 'Booking status cannot change from % to % for this user', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_enforce_update_rules on public.bookings;
create trigger bookings_enforce_update_rules
  before update on public.bookings
  for each row execute function public.enforce_booking_update_rules();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Reviews: publicly readable
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "Reviews are readable by job participants" on public.reviews;
drop policy if exists "Reviews are publicly readable" on public.reviews;

create policy "Reviews are publicly readable"
on public.reviews
for select
to anon, authenticated
using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Job Q&A: only answer/answered_at may change after a question is asked
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_job_question_update_rules()
returns trigger
language plpgsql
as $$
begin
  -- Service-role / SQL-editor sessions are not subject to these rules.
  if auth.uid() is null then
    return new;
  end if;

  if new.job_id        is distinct from old.job_id
     or new.asker_id   is distinct from old.asker_id
     or new.question   is distinct from old.question
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the answer can be changed on a question';
  end if;

  return new;
end;
$$;

drop trigger if exists job_questions_enforce_update_rules on public.job_questions;
create trigger job_questions_enforce_update_rules
  before update on public.job_questions
  for each row execute function public.enforce_job_question_update_rules();
