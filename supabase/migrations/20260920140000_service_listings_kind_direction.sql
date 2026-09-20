-- Listings L1: schema foundation for generalising Services into Listings.
-- Additive: `kind` (what's listed) + `direction` (offering vs wanted), close
-- states, and relaxing `rate` NOT NULL so wanted/quote listings need no rate.
-- Existing rows default to kind='service', direction='offering' -> unchanged
-- behaviour. No RLS change. Idempotent (drop-then-add constraints; this DB has
-- an out-of-band drift history).

alter table public.services
  add column if not exists kind         text not null default 'service',
  add column if not exists direction    text not null default 'offering',
  add column if not exists close_reason text,
  add column if not exists closed_at    timestamptz;

alter table public.services drop constraint if exists services_kind_valid;
alter table public.services
  add constraint services_kind_valid
  check (kind in ('service','grazing','hire','lease','for_sale'));

alter table public.services drop constraint if exists services_direction_valid;
alter table public.services
  add constraint services_direction_valid
  check (direction in ('offering','wanted'));

alter table public.services drop constraint if exists services_close_reason_valid;
alter table public.services
  add constraint services_close_reason_valid
  check (close_reason is null or close_reason in ('sold','taken','filled','expired'));

-- wanted / quote listings have no rate to advertise.
alter table public.services alter column rate drop not null;
