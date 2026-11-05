-- Use the other person's first name in notification bodies instead of the role
-- words "the requester" / "the provider". Only the user-facing body text changes:
-- notification types, metadata, recipients, transition logic, exception messages
-- and SECURITY DEFINER / search_path are all preserved. Existing notification
-- rows are not rewritten. Benefits the mobile app too (no app update needed).
--
-- First name = first word of profiles.full_name; fallback "Someone" at the start
-- of a sentence, "them" mid-sentence.
begin;

-- ─── Jobs: completion + cancellation ───────────────────────────────────────────
create or replace function public.notify_job_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_provider uuid;
  v_provider_name text;
  v_requester_name text;
begin
  if new.status = old.status then return new; end if;
  select provider_id into v_provider from public.bids where job_id = new.id and status = 'accepted' limit 1;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_requester_name from public.profiles where id = new.requester_id;
  if v_provider is not null then
    select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_provider_name from public.profiles where id = v_provider;
  end if;
  if new.status = 'completed' then
    insert into public.notifications(user_id, type, body, metadata)
    values (new.requester_id, 'job_completed',
      format('%s marked "%s" complete. Leave a review of your experience.', coalesce(v_provider_name, 'Someone'), coalesce(new.title, 'Your job')),
      jsonb_build_object('job_id', new.id));
    if v_provider is not null then
      insert into public.notifications(user_id, type, body, metadata)
      values (v_provider, 'job_completed',
        format('"%s" is complete. You can review %s.', coalesce(new.title, 'Your job'), coalesce(v_requester_name, 'them')),
        jsonb_build_object('job_id', new.id));
    end if;
  elsif new.status = 'cancelled' and old.status in ('accepted', 'in_progress', 'awaiting_completion') and v_provider is not null then
    insert into public.notifications(user_id, type, body, metadata)
    values (v_provider, 'job_cancelled',
      format('The job "%s" has been cancelled by %s.', coalesce(new.title, 'a job'), coalesce(v_requester_name, 'them')),
      jsonb_build_object('job_id', new.id));
  end if;
  return new;
exception when others then return new;
end;
$$;

-- ─── Bookings: confirmation + completion + cancellation request ─────────────────
create or replace function public.notify_booking_status_change() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_title text;
  v_provider_name text;
  v_requester_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from services where id = new.service_id;
  v_title := coalesce(v_title, 'your service booking');
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_provider_name from profiles where id = new.provider_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_requester_name from profiles where id = new.requester_id;

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
      format('Your booking for "%s" has been confirmed by %s.', v_title, coalesce(v_provider_name, 'them')),
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

  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_completed',
      format('%s marked "%s" complete. Leave a review of your experience.', coalesce(v_provider_name, 'Someone'), v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id)),
      (new.provider_id, 'booking_completed',
      format('"%s" is complete. You can review %s.', v_title, coalesce(v_requester_name, 'them')),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'cancellation_requested' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'booking_cancellation_requested',
      format('%s has asked to cancel "%s". Please confirm.', coalesce(v_requester_name, 'Someone'), v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));
  end if;

  return new;
exception when others then
  return new;
end;
$$;

-- ─── Reviews: name the reviewer ────────────────────────────────────────────────
create or replace function public.notify_review_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_reviewer text;
begin
  -- Who left the review, by first name.
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_reviewer from profiles where id = new.reviewer_id;
  v_reviewer := coalesce(v_reviewer, 'Someone');

  -- Title of the job, or of the booked service.
  if new.job_id is not null then
    select title into v_title from jobs where id = new.job_id;
  elsif new.booking_id is not null then
    select s.title into v_title
    from bookings b
    join services s on s.id = b.service_id
    where b.id = new.booking_id;
  end if;
  v_title := coalesce(v_title, 'your recent work');

  insert into notifications (user_id, type, body, metadata)
  values (
    new.reviewee_id,
    'review_received',
    format('%s left you a %s★ review for "%s".', v_reviewer, new.rating, v_title),
    jsonb_build_object('job_id', new.job_id, 'booking_id', new.booking_id, 'rating', new.rating)
  );

  return new;
exception when others then
  return new;
end;
$$;

-- ─── Expected-finish prompts: name the provider in the requester's copy ─────────
create or replace function public.queue_due_work_completion_prompts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_provider_name text;
begin
  for v_row in
    select ws.*,
           coalesce(j.title, s.title, 'confirmed work') as title
      from public.work_schedules ws
      left join public.jobs j on j.id = ws.job_id
      left join public.bookings bk on bk.id = ws.booking_id
      left join public.services s on s.id = bk.service_id
     where ws.completion_prompted_at is null
       and ws.expected_complete_at <= now()
       and (
         (ws.job_id is not null and j.status in ('accepted', 'in_progress'))
         or
         (ws.booking_id is not null and bk.status in ('confirmed', 'in_progress'))
       )
     for update of ws skip locked
  loop
    update public.work_schedules
       set completion_prompted_at = now(), updated_at = now()
     where id = v_row.id
       and completion_prompted_at is null;
    if not found then continue; end if;

    select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_provider_name from public.profiles where id = v_row.provider_id;

    insert into public.notifications (user_id, type, body, metadata)
    values
      (
        v_row.provider_id,
        'work_completion_due',
        format('The expected finish time for "%s" has passed. Mark it complete when the work is done.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      ),
      (
        v_row.requester_id,
        'work_completion_due',
        format('The expected finish time for "%s" has passed. %s will mark it complete when finished, then you can leave a review.', v_row.title, coalesce(v_provider_name, 'Someone')),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

commit;
