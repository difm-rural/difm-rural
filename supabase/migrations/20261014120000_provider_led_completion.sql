-- Provider-led completion for jobs and bookings. Requesters review afterwards.
-- Preserve existing price, participant and cancellation guards. Old app builds
-- writing awaiting_completion are normalised before notification triggers run.
begin;

drop policy if exists "Accepted provider can mark awaiting completion" on public.jobs;
create policy "Accepted provider can complete job" on public.jobs
for update to authenticated
using (status in ('accepted', 'in_progress', 'awaiting_completion') and exists (
  select 1 from public.bids b where b.job_id = jobs.id and b.provider_id = auth.uid() and b.status = 'accepted'
))
with check (status = 'completed' and exists (
  select 1 from public.bids b where b.job_id = jobs.id and b.provider_id = auth.uid() and b.status = 'accepted'
));

create or replace function public.normalise_job_completion() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'awaiting_completion' and old.status in ('accepted', 'in_progress')
    and exists (select 1 from public.bids b where b.job_id = old.id and b.provider_id = auth.uid() and b.status = 'accepted') then
    new.status := 'completed';
  end if;
  return new;
end;
$$;
create trigger jobs_normalise_completion before update of status on public.jobs
for each row execute function public.normalise_job_completion();

create or replace function public.notify_job_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_provider uuid;
begin
  if new.status = old.status then return new; end if;
  select provider_id into v_provider from public.bids where job_id = new.id and status = 'accepted' limit 1;
  if new.status = 'completed' then
    insert into public.notifications(user_id, type, body, metadata)
    values (new.requester_id, 'job_completed',
      format('The provider marked "%s" complete. Leave a review of your experience.', coalesce(new.title, 'Your job')),
      jsonb_build_object('job_id', new.id));
    if v_provider is not null then
      insert into public.notifications(user_id, type, body, metadata)
      values (v_provider, 'job_completed',
        format('"%s" is complete. You can review the requester.', coalesce(new.title, 'Your job')),
        jsonb_build_object('job_id', new.id));
    end if;
  elsif new.status = 'cancelled' and old.status in ('accepted', 'in_progress', 'awaiting_completion') and v_provider is not null then
    insert into public.notifications(user_id, type, body, metadata)
    values (v_provider, 'job_cancelled',
      format('The job "%s" has been cancelled by the requester.', coalesce(new.title, 'a job')),
      jsonb_build_object('job_id', new.id));
  end if;
  return new;
exception when others then return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO public
    AS $$
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

  -- Old app builds still send awaiting_completion; complete immediately.
  if is_provider and old.status in ('confirmed', 'in_progress') and new.status = 'awaiting_completion' then
    new.status := 'completed';
    status_changed := true;
  end if;

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
        or (old.status = 'confirmed'              and new.status in ('in_progress', 'completed', 'quote_sent'))
        or (old.status in ('in_progress', 'awaiting_completion') and new.status = 'completed')
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

CREATE OR REPLACE FUNCTION public.notify_booking_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_completed',
      format('The provider marked "%s" complete. Leave a review of your experience.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id)),
      (new.provider_id, 'booking_completed',
      format('"%s" is complete. You can review the requester.', v_title),
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

create or replace function public.queue_due_work_completion_prompts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
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
        format('The expected finish time for "%s" has passed. The provider will mark it complete when finished, then you can leave a review.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- These rows already represent work marked done by its provider.
update public.jobs set status = 'completed' where status = 'awaiting_completion';
update public.bookings set status = 'completed' where status = 'awaiting_completion';
-- Retire stale requests to confirm work; fresh completion notifications above
-- now take the requester to a completed record and its review action.
update public.notifications set read = true where type in ('job_ready', 'booking_ready') and read = false;
commit;
