-- Tier 3 service pricing: additional rate options (variants).
-- Additive only: the existing single rate stays the primary/base rate; this
-- column holds ADDITIONAL rate options only, default [] for the common
-- single-rate case. No data migration of existing rates, no RLS change.
-- Idempotent (safe to re-run).

alter table public.services
  add column if not exists pricing_variants jsonb not null default '[]'::jsonb;

-- pricing_variants must be a JSON array.
-- Each element (enforced in app code): { label, pricing_type, rate, unit_label?, min_units?, min_charge? }.
alter table public.services
  drop constraint if exists services_pricing_variants_is_array;
alter table public.services
  add constraint services_pricing_variants_is_array
  check (jsonb_typeof(pricing_variants) = 'array');
