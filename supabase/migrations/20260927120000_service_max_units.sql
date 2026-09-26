-- Pricing redesign step A: max_units for capacity (e.g. grazing head count).
-- Purely additive: nullable, no default. Existing rows and every current flow
-- are unaffected — only grazing per-head listings write it (step B). The check
-- only fires when a value is present. No RLS change. Idempotent.

alter table public.services
  add column if not exists max_units numeric;

alter table public.services drop constraint if exists services_max_units_positive;
alter table public.services
  add constraint services_max_units_positive
  check (max_units is null or max_units > 0);
