-- The confirmation chat message and arrival notifications said
-- "Fri 20 Nov, 10:00am" while every other date on the job reads
-- "Fri 20 Nov 2026" and the web preview says "Fri 20 Nov 2026, 10:00 am".
-- Align the posted text with shared/formatting.js formatWorkDateTime:
-- weekday day month YEAR, unpadded 12-hour time, space before am/pm.
-- Only the to_char format changes; confirm_job and set_work_arrival_window
-- are otherwise the current (20261114221338 / 20261111024439) definitions.

create or replace function public.confirm_job(
  p_bid uuid,
  p_arrival timestamptz,
  p_method text,
  p_message text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_end timestamptz;
  v_finish timestamptz;
  v_provider_name text;
  v_time text;
  v_label text;
  v_body text;
  v_day_suffix text;
  v_day_line text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_msg_id uuid;
  v_ws public.work_schedules;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_bid.provider_id is distinct from auth.uid() or v_bid.status <> 'accepted' then
    raise exception 'Only the accepted provider can confirm the job.';
  end if;
  if p_method not in ('bank_transfer','cash','invoice','agreed') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.status not in ('accepted','in_progress') then
    raise exception 'This job is not in a state to confirm.';
  end if;
  if p_arrival <= now() then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;

  v_end := p_arrival + interval '30 minutes';
  v_finish := public.arrival_expected_finish(p_arrival, v_end, null);
  v_time := to_char(p_arrival at time zone 'Pacific/Auckland', 'Dy FMDD Mon YYYY, FMHH12:MI am');
  v_label := case p_method
    when 'bank_transfer' then 'bank transfer'
    when 'cash' then 'cash on the day'
    when 'invoice' then 'invoice'
    else 'already agreed' end;
  select full_name into v_provider_name from public.profiles where id = v_bid.provider_id;

  -- One combined thread message: arrival (and how it matches the requested
  -- date), payment (with amount), optional note, then any payment details.
  -- How the chosen day relates to the date the requester asked for.
  select n.suffix, n.line into v_day_suffix, v_day_line
    from public.job_requested_day_note(
      v_job.schedule_type, v_job.scheduled_date, v_job.date_from, v_job.date_to,
      (p_arrival at time zone 'Pacific/Auckland')::date) n;

  v_body := format('Confirmed: I''ll be there around %s%s.', v_time, v_day_suffix);
  if v_day_line <> '' then
    v_body := v_body || E'\n' || v_day_line;
  end if;
  v_body := v_body || E'\n' || public.job_payment_line(v_bid.amount, v_bid.pricing_type, p_method);
  if v_note is not null then
    v_body := v_body || E'\n' || 'Note: ' || v_note;
  end if;
  if coalesce(btrim(p_message), '') <> '' then
    v_body := v_body || E'\n\n' || p_message;
  end if;
  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (v_job.id, v_bid.provider_id, v_job.requester_id, v_body)
  returning id into v_msg_id;

  -- Arrival (reuses the shared finish rule).
  update public.work_schedules
     set arrival_start_at = p_arrival, arrival_end_at = v_end, expected_complete_at = v_finish,
         set_by = v_bid.provider_id, completion_prompted_at = null, updated_at = now()
   where job_id = v_job.id
  returning * into v_ws;
  if v_ws.id is null then
    insert into public.work_schedules (
      job_id, requester_id, provider_id, arrival_start_at, arrival_end_at, expected_complete_at, set_by
    ) values (
      v_job.id, v_job.requester_id, v_bid.provider_id, p_arrival, v_end, v_finish, v_bid.provider_id
    )
    returning * into v_ws;
  end if;

  -- Payment.
  update public.bids
     set payment_method = p_method, payment_details_sent_at = now(), payment_message_id = v_msg_id
   where id = v_bid.id;

  -- One notification (suppresses the individual arrival/payment ones).
  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id, 'job_confirmed',
    format('%s confirmed "%s": around %s, %s.',
      coalesce(v_provider_name, 'The provider'), coalesce(v_job.title, 'the job'), v_time, v_label),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.confirm_job(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.confirm_job(uuid, timestamptz, text, text, text) to authenticated;

create or replace function public.set_work_arrival_window(
  p_job_id uuid,
  p_booking_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_expected_complete timestamptz default null
)
returns public.work_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
  v_provider uuid;
  v_title text;
  v_finish timestamptz;
  v_row public.work_schedules;
begin
  if v_actor is null or (p_job_id is null) = (p_booking_id is null) then
    raise exception 'Invalid schedule request';
  end if;
  if p_start <= now() or p_end <= p_start or p_end > p_start + interval '24 hours' then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;
  if p_expected_complete is not null
     and (p_expected_complete < p_end or p_expected_complete > p_start + interval '7 days') then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;
  v_finish := public.arrival_expected_finish(p_start, p_end, p_expected_complete);

  if p_job_id is not null then
    select j.requester_id, b.provider_id, j.title
      into v_requester, v_provider, v_title
      from public.jobs j
      join public.bids b on b.job_id = j.id and b.status = 'accepted'
     where j.id = p_job_id and j.status in ('accepted', 'in_progress');
  else
    select bk.requester_id, bk.provider_id, coalesce(s.title, 'service booking')
      into v_requester, v_provider, v_title
      from public.bookings bk
      left join public.services s on s.id = bk.service_id
     where bk.id = p_booking_id and bk.status in ('confirmed', 'in_progress');
  end if;

  if v_provider is null or v_actor <> v_provider then
    raise exception 'Only the confirmed provider can set the arrival window';
  end if;

  update public.work_schedules
     set arrival_start_at = p_start, arrival_end_at = p_end, expected_complete_at = v_finish,
         set_by = v_actor, completion_prompted_at = null, updated_at = now()
   where (p_job_id is not null and job_id = p_job_id)
      or (p_booking_id is not null and booking_id = p_booking_id)
  returning * into v_row;

  if v_row.id is null then
    insert into public.work_schedules (
      job_id, booking_id, requester_id, provider_id,
      arrival_start_at, arrival_end_at, expected_complete_at, set_by
    ) values (
      p_job_id, p_booking_id, v_requester, v_provider, p_start, p_end, v_finish, v_actor
    )
    returning * into v_row;
  end if;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_requester, 'arrival_window_confirmed',
    format('Expected arrival for "%s": around %s.', coalesce(v_title, 'confirmed work'),
      to_char(p_start at time zone 'Pacific/Auckland', 'Dy FMDD Mon YYYY, FMHH12:MI am')),
    jsonb_strip_nulls(jsonb_build_object('job_id', p_job_id, 'booking_id', p_booking_id, 'work_schedule_id', v_row.id))
  );
  return v_row;
end;
$$;
revoke all on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz, timestamptz) to authenticated;
