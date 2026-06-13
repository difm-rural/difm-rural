create table if not exists public.service_drafts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'photo', 'url')),
  source_image_path text,
  source_url text,
  extracted_text text,
  ai_raw_json jsonb,
  title text,
  category text,
  short_description text,
  full_description text,
  service_area text,
  pricing_type text,
  price_amount numeric,
  pricing_notes text,
  availability text,
  equipment text[] not null default '{}',
  tags text[] not null default '{}',
  contact_details_found text[] not null default '{}',
  missing_fields text[] not null default '{}',
  confidence_notes text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'ready_to_publish', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_drafts enable row level security;

drop policy if exists "Providers can read their own service drafts" on public.service_drafts;
create policy "Providers can read their own service drafts"
on public.service_drafts
for select
to authenticated
using (auth.uid() = provider_id);

drop policy if exists "Providers can create their own service drafts" on public.service_drafts;
create policy "Providers can create their own service drafts"
on public.service_drafts
for insert
to authenticated
with check (auth.uid() = provider_id);

drop policy if exists "Providers can update their own service drafts" on public.service_drafts;
create policy "Providers can update their own service drafts"
on public.service_drafts
for update
to authenticated
using (auth.uid() = provider_id)
with check (auth.uid() = provider_id);

drop policy if exists "Providers can delete their own service drafts" on public.service_drafts;
create policy "Providers can delete their own service drafts"
on public.service_drafts
for delete
to authenticated
using (auth.uid() = provider_id);
