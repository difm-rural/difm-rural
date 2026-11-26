-- Offers can say what time the provider could start, not just the day
-- (Grokbot E2E run 2: the provider had to write "around 9am" in the duration
-- box). Optional, and only meaningful with available_from. The provider still
-- confirms the exact arrival after acceptance; this pre-fills that step.
alter table public.bids add column if not exists available_time time;
alter table public.bids drop constraint if exists bids_available_time_needs_day;
alter table public.bids add constraint bids_available_time_needs_day
  check (available_time is null or available_from is not null);

-- Same as the 20261118200000 definition, plus available_time.
CREATE OR REPLACE FUNCTION public.update_pending_job_offer_details(p_offer_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare amount numeric; item jsonb; total numeric:=0; available text; available_at text; offer public.bids%rowtype; job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into offer from public.bids where id=p_offer_id;
 if not found or offer.provider_id is distinct from auth.uid() then raise exception 'This offer is unavailable.'; end if;
 select * into job from public.jobs where id=offer.job_id for update;
 if not found or job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
 select * into offer from public.bids where id=p_offer_id for update;
 if not found or offer.status <> 'pending' or offer.provider_id is distinct from auth.uid() then raise exception 'This offer has changed.'; end if;
 if length(coalesce(p_details->>'message',''))>5000 then raise exception 'Message is too long.'; end if;
 if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_details->'line_items') is distinct from 'array' then raise exception 'Invalid offer details.'; end if;
 if jsonb_array_length(p_details->'line_items') not between 1 and 12 then raise exception 'Add one to twelve price lines.'; end if;
 for item in select * from jsonb_array_elements(p_details->'line_items') loop
  if nullif(trim(item->>'label'),'') is null or length(item->>'label')>120 or jsonb_typeof(item->'amount') is distinct from 'number' then raise exception 'Invalid price line.'; end if;
  amount=(item->>'amount')::numeric;
  if amount<0 or amount>10000000 then raise exception 'Invalid price amount.'; end if;
  total=total+amount;
 end loop;
 if total<=0 or total>10000000 or round(total,2) is distinct from (p_details->>'amount')::numeric then raise exception 'Offer amount must equal price lines.'; end if;
 if coalesce(p_details->>'pricing_type','') not in ('fixed','hourly','per_unit','quote') or (p_details->>'materials' is not null and p_details->>'materials' not in ('included','estimate','quote')) or length(coalesce(p_details->>'estimated_duration',''))>150 then raise exception 'Invalid offer terms.'; end if;
 available=nullif(p_details->>'available_from','');
 if available is not null and (available !~ '^\d{4}-\d{2}-\d{2}$' or to_char(available::date,'YYYY-MM-DD')<>available) then raise exception 'Invalid availability date.'; end if;
  available_at=nullif(p_details->>'available_time','');
 if available_at is not null and (available is null or available_at !~ '^([01]\d|2[0-3]):[0-5]\d$') then raise exception 'Invalid availability time.'; end if;
 update public.bids set amount=round(total,2),line_items=p_details->'line_items',message=nullif(trim(p_details->>'message'),''),pricing_type=p_details->>'pricing_type',materials=p_details->>'materials',available_from=available,available_time=available_at::time,estimated_duration=nullif(p_details->>'estimated_duration','') where id=p_offer_id;
end;
$function$;
