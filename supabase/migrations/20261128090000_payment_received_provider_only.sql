-- "Payment received": the provider records that they've been paid, once the
-- job is complete. It's a reminder for them and a record for us, nothing more:
-- no chat line and no notification (previously "Payment all taken care of ✓"
-- was posted into the thread and the other person was notified).
--
-- Changes from the live mark_job_payment_sorted:
-- * only the accepted provider may mark or undo it (was: either party);
-- * only for completed jobs (was: accepted or completed);
-- * no messages / notifications inserts.
-- Columns are unchanged (bids.payment_sorted_at / payment_sorted_by).

create or replace function public.mark_job_payment_sorted(p_bid uuid, p_undo boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_job_id uuid;
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
  select job_id into v_job_id from public.bids where id = p_bid;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Match accept_job_offer's job → bid lock order.
  select * into v_job from public.jobs where id = v_job_id for share;
  if not found then raise exception 'This offer is unavailable.'; end if;

  select * into v_bid from public.bids where id = p_bid and job_id = v_job_id for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_actor is null
     or v_bid.status is distinct from 'accepted'
     or v_actor is distinct from v_bid.provider_id then
    raise exception 'Only the provider who did the job can record payment.';
  end if;
  if v_job.status is distinct from 'completed' then
    raise exception 'Payment can be recorded once the job is complete.';
  end if;
  if v_bid.provider_id = v_job.requester_id
     or exists (
       select 1 from public.bids other
       where other.job_id = v_job.id and other.status = 'accepted' and other.id <> v_bid.id
     ) then
    raise exception 'This job does not have a valid winning offer.';
  end if;

  -- Already in the requested state: nothing to do.
  if coalesce(p_undo, false) = (v_bid.payment_sorted_at is null) then
    return;
  end if;

  if p_undo then
    update public.bids set payment_sorted_at = null, payment_sorted_by = null where id = v_bid.id;
  else
    update public.bids set payment_sorted_at = now(), payment_sorted_by = v_actor where id = v_bid.id;
  end if;
end;
$function$;
