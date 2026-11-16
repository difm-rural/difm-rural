-- Listing photos (bucket 'service-photos'): only the listing's owner may add,
-- replace or delete them. Previously any signed-in user could write or delete
-- any listing photo.
--
-- Every listing photo is stored under the listing's id as its first folder:
--   <service id>/<file>.jpg   and its card thumbnail   <service id>/<file>_thumb.jpg
-- (app CreateServiceScreen.uploadPhotos, web listing-form, lib photoThumbs /
-- photo-thumbs). Both upload only after the listing row exists. A write is
-- allowed when that folder is a listing whose provider_id is the caller.
--
-- Reads stay public (cards, detail pages and the public site load photos by
-- their public URL). The "Create from website" import copies the image with the
-- service-role key, which bypasses RLS; it checks ownership itself first.
-- Objects in folders of deleted listings simply can't be changed by users now.
--
-- Idempotent: drops the old and new policy names before creating.

drop policy if exists "authenticated users can upload service photos" on storage.objects;
drop policy if exists "authenticated users can update service photos" on storage.objects;
drop policy if exists "authenticated users can delete service photos" on storage.objects;
drop policy if exists "listing owners can upload service photos" on storage.objects;
drop policy if exists "listing owners can update service photos" on storage.objects;
drop policy if exists "listing owners can delete service photos" on storage.objects;

-- The caller owns the listing named by the object's first folder. Reads
-- public.services under the caller's own RLS ("Providers can read their own
-- services" covers paused and closed listings too). Compared as text so a
-- folder that isn't a uuid simply doesn't match.
create policy "listing owners can upload service photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.services s
      where s.id::text = (storage.foldername(name))[1]
        and s.provider_id = auth.uid()
    )
  );

create policy "listing owners can update service photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.services s
      where s.id::text = (storage.foldername(name))[1]
        and s.provider_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.services s
      where s.id::text = (storage.foldername(name))[1]
        and s.provider_id = auth.uid()
    )
  );

create policy "listing owners can delete service photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.services s
      where s.id::text = (storage.foldername(name))[1]
        and s.provider_id = auth.uid()
    )
  );

-- Unchanged: "service photos are public" (SELECT, bucket_id = 'service-photos').
