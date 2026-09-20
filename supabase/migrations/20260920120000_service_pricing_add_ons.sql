-- Tier 2 service pricing: display-only add-ons, free-text terms, minimum charge.
-- Additive only: no RLS, no trigger, no change to booking totals. Existing rows
-- default to an empty add-on list with null terms/min_charge, so they render
-- exactly as before. Idempotent (safe to re-run).

alter table public.services
  add column if not exists pricing_add_ons jsonb not null default '[]'::jsonb,
  add column if not exists pricing_terms   text,
  add column if not exists min_charge      numeric;

-- pricing_add_ons must be a JSON array.
-- Each element (enforced in app code): { label, basis, amount, optional, unit_label? }.
alter table public.services
  drop constraint if exists services_pricing_add_ons_is_array;
alter table public.services
  add constraint services_pricing_add_ons_is_array
  check (jsonb_typeof(pricing_add_ons) = 'array');

-- min_charge, when set, is non-negative.
alter table public.services
  drop constraint if exists services_min_charge_nonneg;
alter table public.services
  add constraint services_min_charge_nonneg
  check (min_charge is null or min_charge >= 0);
