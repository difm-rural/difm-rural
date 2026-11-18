begin;

-- Private bookmarks are independent of completed work and invitation access.
create table public.saved_providers (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, provider_id),
  check (requester_id <> provider_id)
);
create index saved_providers_provider_idx on public.saved_providers(provider_id);
alter table public.saved_providers enable row level security;
revoke all on public.saved_providers from public, anon, authenticated;
grant select, delete on public.saved_providers to authenticated;
grant insert(requester_id, provider_id) on public.saved_providers to authenticated;

create policy "Read own saved providers" on public.saved_providers for select to authenticated
  using (requester_id = (select auth.uid()));
create policy "Save discoverable providers for yourself" on public.saved_providers for insert to authenticated
  with check (requester_id = (select auth.uid())
    and exists (select 1 from public.profiles_public p where p.id = provider_id));
create policy "Remove own saved providers" on public.saved_providers for delete to authenticated
  using (requester_id = (select auth.uid()));

commit;
