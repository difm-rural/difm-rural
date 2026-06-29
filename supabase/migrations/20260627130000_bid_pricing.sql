-- Provider offer (bid) pricing basis + materials handling.
--   pricing_type: 'fixed' | 'hourly' | 'per_unit' | 'quote'
--   materials:    'included' | 'estimate' | 'quote'  (only set when the job asks
--                 the provider to supply materials, i.e. jobs.materials_type = 'provider')
-- Nullable / free-text so the preview UI can evolve without a constraint change.
alter table public.bids
  add column if not exists pricing_type text;
alter table public.bids
  add column if not exists materials text;
