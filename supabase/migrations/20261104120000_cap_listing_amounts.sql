-- Lower the cap for listing amounts only. Keep existing rows and job budgets intact.
create or replace function public.listing_money_valid(value text, allow_zero boolean default false)
returns boolean language plpgsql immutable set search_path = public as $$
declare amount numeric;
begin
  if value is null or btrim(value) !~ '^(\d+(\.\d{0,2})?|\.\d{1,2})$' then return false; end if;
  amount := btrim(value)::numeric;
  return amount <= 1000000 and case when allow_zero then amount >= 0 else amount > 0 end;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;
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
  if new.pricing_type is distinct from 'quote_required' and not public.listing_money_valid(new.rate::text,true) then
    raise exception using errcode='22003',message='Rate must be zero or more, no more than $1,000,000.00, with at most two decimal places.';
  end if;
  if new.min_charge is not null and not public.listing_money_valid(new.min_charge::text,true) then
    raise exception using errcode='22003',message='Minimum charge must be zero or more, no more than $1,000,000.00, with at most two decimal places.';
  end if;
  for item in select * from jsonb_array_elements(coalesce(new.pricing_add_ons,'[]'::jsonb)) loop
    if not public.listing_money_valid(item->>'amount',true) then
      raise exception using errcode='22003',message='Extra charges must be zero or more, no more than $1,000,000.00, with at most two decimal places.';
    end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(new.pricing_variants,'[]'::jsonb)) loop
    if not public.listing_money_valid(item->>'rate') then
      raise exception using errcode='22003',message='Alternate rates must be greater than zero, no more than $1,000,000.00, with at most two decimal places.';
    end if;
    if nullif(item->>'min_charge','') is not null and not public.listing_money_valid(item->>'min_charge',true) then
      raise exception using errcode='22003',message='Alternate minimum charges must be zero or more, no more than $1,000,000.00, with at most two decimal places.';
    end if;
  end loop;
  return new;
end;
$$;
