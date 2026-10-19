-- Serialize offer changes with acceptance by locking job, then offer.
-- Withdrawal is deliberately scoped here rather than adding a broad DELETE policy.
create or replace function public.change_pending_job_offer(p_offer_id uuid,p_intent text,p_amount numeric default null,p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into offer from public.bids where id=p_offer_id;
 if not found or offer.provider_id is distinct from auth.uid() then raise exception 'This offer is unavailable.'; end if;
 select * into job from public.jobs where id=offer.job_id for update;
 if not found or job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
 select * into offer from public.bids where id=p_offer_id for update;
 if not found or offer.status <> 'pending' or offer.provider_id is distinct from auth.uid() then raise exception 'This offer has changed.'; end if;
 if p_intent='withdraw' then
  delete from public.bids where id=offer.id;
 else raise exception 'Invalid offer action.';
 end if;
end;
$$;
revoke all on function public.change_pending_job_offer(uuid,text,numeric,text) from public,anon;
grant execute on function public.change_pending_job_offer(uuid,text,numeric,text) to authenticated;


-- Keep the app's itemised price, availability and materials consistent as one update.
create or replace function public.update_pending_job_offer_details(p_offer_id uuid,p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare amount numeric; item jsonb; total numeric:=0; available text; offer public.bids%rowtype; job public.jobs%rowtype;
begin
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
 update public.bids set amount=round(total,2),line_items=p_details->'line_items',message=nullif(trim(p_details->>'message'),''),pricing_type=p_details->>'pricing_type',materials=p_details->>'materials',available_from=available,estimated_duration=nullif(p_details->>'estimated_duration','') where id=p_offer_id;
end;
$$;
revoke all on function public.update_pending_job_offer_details(uuid,jsonb) from public,anon;
grant execute on function public.update_pending_job_offer_details(uuid,jsonb) to authenticated;
