-- Same $10m / two-decimal currency limits as the mobile and web forms.
-- Historical invalid values are not rewritten or allowed to block unrelated status updates.
create or replace function public.posting_money_valid(value text, allow_zero boolean default false)
returns boolean language plpgsql immutable set search_path = public as $$
declare amount numeric;
begin
  if value is null or btrim(value) !~ '^(\d+(\.\d{0,2})?|\.\d{1,2})$' then return false; end if;
  amount := btrim(value)::numeric;
  return amount <= 10000000 and case when allow_zero then amount >= 0 else amount > 0 end;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;
create or replace function public.validate_job_posting_amounts()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.price_type is not distinct from old.price_type and new.price is not distinct from old.price then return new; end if;
  end if;
  if new.price_type = 'fixed' and not public.posting_money_valid(new.price::text) then
    raise exception using errcode='22003',message='Budget must be greater than zero, no more than $10,000,000, with at most two decimal places.';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_job_posting_amounts on public.jobs;
create trigger validate_job_posting_amounts before insert or update on public.jobs
for each row execute function public.validate_job_posting_amounts();

create or replace function public.validate_listing_posting_amounts()
returns trigger language plpgsql set search_path = public as $$
declare item jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.pricing_type is not distinct from old.pricing_type
      and new.rate is not distinct from old.rate
      and new.min_charge is not distinct from old.min_charge
      and new.pricing_add_ons is not distinct from old.pricing_add_ons
      and new.pricing_variants is not distinct from old.pricing_variants then return new; end if;
  end if;
  if new.pricing_type is distinct from 'quote_required' and not public.posting_money_valid(new.rate::text,true) then
    raise exception using errcode='22003',message='Rate must be zero or more, no more than $10,000,000, with at most two decimal places.';
  end if;
  if new.min_charge is not null and not public.posting_money_valid(new.min_charge::text,true) then
    raise exception using errcode='22003',message='Minimum charge must be zero or more, no more than $10,000,000, with at most two decimal places.';
  end if;
  for item in select * from jsonb_array_elements(coalesce(new.pricing_add_ons,'[]'::jsonb)) loop
    if not public.posting_money_valid(item->>'amount',true) then
      raise exception using errcode='22003',message='Extra charges must be zero or more, no more than $10,000,000, with at most two decimal places.';
    end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(new.pricing_variants,'[]'::jsonb)) loop
    if not public.posting_money_valid(item->>'rate') then
      raise exception using errcode='22003',message='Alternate rates must be greater than zero, no more than $10,000,000, with at most two decimal places.';
    end if;
    if nullif(item->>'min_charge','') is not null and not public.posting_money_valid(item->>'min_charge',true) then
      raise exception using errcode='22003',message='Alternate minimum charges must be zero or more, no more than $10,000,000, with at most two decimal places.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists validate_listing_posting_amounts on public.services;
create trigger validate_listing_posting_amounts before insert or update on public.services
for each row execute function public.validate_listing_posting_amounts();
