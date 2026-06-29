-- Materials policy for a service listing (see CreateServiceScreen pricing step).
-- Values: 'included' | 'estimate' | 'requester_supplies'. Nullable / free-text
-- so the preview UI can evolve without a constraint migration.
alter table public.services
  add column if not exists materials text;
