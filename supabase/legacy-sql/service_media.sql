-- Service photo support for DIFM Rural.
-- Run this in the Supabase SQL editor if service photo uploads fail or the
-- services table does not yet have a photos field.

alter table public.services
  add column if not exists photos text[] default '{}'::text[];

insert into storage.buckets (id, name, public)
values ('service-photos', 'service-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "service photos are public" on storage.objects;
drop policy if exists "authenticated users can upload service photos" on storage.objects;
drop policy if exists "authenticated users can update service photos" on storage.objects;
drop policy if exists "authenticated users can delete service photos" on storage.objects;

create policy "service photos are public"
on storage.objects for select
using (bucket_id = 'service-photos');

create policy "authenticated users can upload service photos"
on storage.objects for insert
with check (bucket_id = 'service-photos' and auth.role() = 'authenticated');

create policy "authenticated users can update service photos"
on storage.objects for update
using (bucket_id = 'service-photos' and auth.role() = 'authenticated')
with check (bucket_id = 'service-photos' and auth.role() = 'authenticated');

create policy "authenticated users can delete service photos"
on storage.objects for delete
using (bucket_id = 'service-photos' and auth.role() = 'authenticated');
