-- confirm_job: say how the confirmed day relates to the date the requester
-- asked for. Same signature; only the posted message changes.
--   match    → "…around Sun 15 Nov, 09:00am (the day you asked for)."
--   mismatch → extra line "Note: that's Mon 16 Nov, not the Sun 15 Nov you asked for."
--   flexible / as soon as possible / no date → nothing extra.

-- The wording, in one place. Mirrors arrivalDayNote() in shared/requestedDate.ts
-- so the app and web previews match what gets posted.
create or replace function public.job_requested_day_note(
  p_schedule_type text,
  p_scheduled_date text,
  p_date_from date,
  p_date_to date,
  p_day date,
  out suffix text,
  out line text
)
language plpgsql
immutable
as $$
declare
  v_type text := lower(btrim(coalesce(p_schedule_type, '')));
  v_from date;
  v_to date;
  v_asked text;
begin
  suffix := '';
  line := '';
  if p_day is null then return; end if;

  -- Rows saved before schedule_type existed: infer it from the dates.
  if v_type = '' then
    v_type := case when p_scheduled_date is not null then 'specific'
                   when p_date_from is not null or p_date_to is not null then 'range'
                   else 'flexible' end;
  end if;

  if v_type = 'specific' and p_scheduled_date ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      if length(p_scheduled_date) = 10 then
        v_from := p_scheduled_date::date;
      else
        v_from := (p_scheduled_date::timestamptz at time zone 'Pacific/Auckland')::date;
      end if;
    exception when others then
      return; -- not a real date: treat as flexible
    end;
    v_to := v_from;
  elsif v_type = 'range' and p_date_from is not null and p_date_to is not null and p_date_from <= p_date_to then
    v_from := p_date_from;
    v_to := p_date_to;
  else
    return;
  end if;

  if p_day between v_from and v_to then
    suffix := ' (the day you asked for)';
    return;
  end if;

  v_asked := case
    when v_from = v_to then to_char(v_from, 'Dy FMDD Mon')
    when date_trunc('month', v_from) = date_trunc('month', v_to)
      then to_char(v_from, 'FMDD') || '–' || to_char(v_to, 'FMDD Mon')
    else to_char(v_from, 'FMDD Mon') || ' – ' || to_char(v_to, 'FMDD Mon') end;
  line := format('Note: that''s %s, not the %s you asked for.', to_char(p_day, 'Dy FMDD Mon'), v_asked);
end;
$$;
revoke all on function public.job_requested_day_note(text, text, date, date, date) from public, anon;
grant execute on function public.job_requested_day_note(text, text, date, date, date) to authenticated;

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
  v_time := to_char(p_arrival at time zone 'Pacific/Auckland', 'Dy FMDD Mon, HH12:MIam');
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
