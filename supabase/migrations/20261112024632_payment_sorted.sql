-- Flexible payment for accepted JOBS (bookings unchanged).
--
-- One "Payment all taken care of" flag that EITHER party of the accepted offer
-- can set or undo at any time while the job is accepted — replaces the
-- requester-only "I've paid". The confirmation message now also carries the
-- agreed amount ("Payment: $150 by bank transfer") and an optional note.
-- Rural Connections still never handles the money.

-- 1. Columns. payment_marked_sent_at stays for now but is no longer written.
alter table public.bids
  add column if not exists payment_sorted_at timestamptz,
  add column if not exists payment_sorted_by uuid references public.profiles(id);

update public.bids b
   set payment_sorted_at = b.payment_marked_sent_at,
       payment_sorted_by = j.requester_id
  from public.jobs j
 where j.id = b.job_id
   and b.payment_marked_sent_at is not null
   and b.payment_sorted_at is null;

-- "Payment: $150 by bank transfer" / "Payment: $45/hr cash on the day".
-- Mirrors shared/offers.ts paymentLine() so previews match what gets posted.
create or replace function public.job_payment_line(
  p_amount numeric,
  p_pricing_type text,
  p_method text
) returns text
language sql
immutable
as $$
  select 'Payment: '
    || case
         when p_amount is null or p_amount <= 0 then ''
         else '$'
           || case when p_amount % 1 = 0
                then to_char(p_amount, 'FM999,999,999,990')
                else to_char(p_amount, 'FM999,999,999,990.00') end
           || case p_pricing_type
                when 'hourly' then '/hr'
                when 'per_unit' then '/unit'
                when 'quote' then ' est.'
                else '' end
           || ' '
       end
    || case p_method
         when 'bank_transfer' then 'by bank transfer'
         when 'cash' then 'cash on the day'
         when 'invoice' then 'by invoice'
         else 'as agreed' end
$$;
revoke all on function public.job_payment_line(numeric, text, text) from public, anon;
grant execute on function public.job_payment_line(numeric, text, text) to authenticated;

-- 2. Either party marks payment as taken care of (or undoes it).
create or replace function public.mark_job_payment_sorted(
  p_bid uuid,
  p_undo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_other uuid;
  v_actor_name text;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found
     or v_actor is null
     or v_bid.status <> 'accepted'
     or (v_actor is distinct from v_bid.provider_id and v_actor is distinct from v_job.requester_id) then
    raise exception 'Only the requester or the accepted provider can update payment.';
  end if;
  if v_job.status <> 'accepted' then
    raise exception 'This job is no longer awaiting payment.';
  end if;

  -- Nothing to change → no duplicate message or notification.
  if coalesce(p_undo, false) = (v_bid.payment_sorted_at is null) then
    return;
  end if;

  v_other := case when v_actor = v_bid.provider_id then v_job.requester_id else v_bid.provider_id end;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_actor_name
    from public.profiles where id = v_actor;

  if p_undo then
    update public.bids set payment_sorted_at = null, payment_sorted_by = null where id = v_bid.id;
  else
    update public.bids set payment_sorted_at = now(), payment_sorted_by = v_actor where id = v_bid.id;
  end if;

  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (
    v_job.id, v_actor, v_other,
    case when p_undo then 'Payment marked as not sorted yet' else 'Payment all taken care of ✓' end
  );

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_other,
    case when p_undo then 'payment_unsorted' else 'payment_sorted' end,
    format(
      case when p_undo then '%s marked payment as not sorted yet for "%s".'
           else '%s marked payment as all taken care of for "%s".' end,
      coalesce(v_actor_name, 'Someone'), coalesce(v_job.title, 'the job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.mark_job_payment_sorted(uuid, boolean) from public, anon;
grant execute on function public.mark_job_payment_sorted(uuid, boolean) to authenticated;

-- Old RPC (older app builds): same signature, now runs the new logic.
create or replace function public.mark_job_payment_sent(
  p_bid uuid,
  p_undo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mark_job_payment_sorted(p_bid, p_undo);
end;
$$;

revoke all on function public.mark_job_payment_sent(uuid, boolean) from public, anon;
grant execute on function public.mark_job_payment_sent(uuid, boolean) to authenticated;

-- 3a. Changing the payment method: the posted message leads with the amount.
--     No longer blocked once payment is marked — the flag can be undone anyway.
create or replace function public.set_job_payment_method(
  p_bid uuid,
  p_method text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_body text;
  v_msg_id uuid;
begin
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_bid.provider_id is distinct from auth.uid() or v_bid.status <> 'accepted' then
    raise exception 'Only the accepted provider can set the payment method.';
  end if;
  if p_method not in ('bank_transfer','cash','invoice','agreed') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.status not in ('accepted','in_progress') then
    raise exception 'This job is not in a state to arrange payment.';
  end if;

  v_body := public.job_payment_line(v_bid.amount, v_bid.pricing_type, p_method);
  if coalesce(btrim(p_message), '') <> '' then
    v_body := v_body || E'\n\n' || p_message;
  end if;
  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (v_job.id, v_bid.provider_id, v_job.requester_id, v_body)
  returning id into v_msg_id;

  update public.bids
    set payment_method = p_method,
        payment_details_sent_at = now(),
        payment_message_id = v_msg_id
    where id = v_bid.id;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id,
    'payment_details_sent',
    format('The provider shared how to pay for "%s".', coalesce(v_job.title, 'your job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$$;

revoke all on function public.set_job_payment_method(uuid, text, text) from public, anon;
grant execute on function public.set_job_payment_method(uuid, text, text) to authenticated;

-- 3b. confirm_job gains an optional note and posts the amount. The 4-argument
--     version is dropped so the new default-null p_note doesn't make old
--     4-argument calls ambiguous; they resolve to this one.
drop function if exists public.confirm_job(uuid, timestamptz, text, text);

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

  -- One combined thread message: arrival, payment (with amount), optional note,
  -- then any payment details (e.g. the bank account).
  v_body := format('Confirmed: I''ll be there around %s.', v_time)
    || E'\n' || public.job_payment_line(v_bid.amount, v_bid.pricing_type, p_method);
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
