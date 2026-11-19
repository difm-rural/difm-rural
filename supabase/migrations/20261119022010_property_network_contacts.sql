-- My Property Network: private contacts for providers who are not on Rural
-- Connections. A contact is visible only to its owner, never to AI assistant
-- tokens, and is never matched against member accounts. Contacts link to the
-- owner's services like members do; "Replace with member" moves every link to
-- a member and deletes the contact in one transaction.
begin;

create table public.property_network_contacts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (name=btrim(name) and char_length(name) between 1 and 80),
 phone text check (phone is null or (char_length(phone) between 1 and 30 and phone ~ '^[0-9 +()-]+$' and phone ~ '[0-9]')),
 email text check (email is null or (char_length(email)<=254 and email=lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
 note text check (note is null or char_length(note) between 1 and 200),
 created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create index property_network_contacts_owner_idx on public.property_network_contacts(owner_id);

create table public.property_network_contact_links (
 owner_id uuid not null,
 area text not null,
 service_key text not null,
 contact_id uuid not null,
 primary key(owner_id,area,service_key,contact_id),
 foreign key(owner_id,area,service_key) references public.property_network_services(owner_id,area,service_key) on delete cascade,
 -- The contact must belong to the same owner as the link.
 foreign key(contact_id,owner_id) references public.property_network_contacts(id,owner_id) on delete cascade
);
create index property_network_contact_links_contact_idx on public.property_network_contact_links(contact_id);

alter table public.property_network_contacts enable row level security;
alter table public.property_network_contact_links enable row level security;
revoke all on public.property_network_contacts,public.property_network_contact_links from public,anon,authenticated;
grant select,insert,update,delete on public.property_network_contacts to authenticated;
grant select,insert,delete on public.property_network_contact_links to authenticated;

create policy property_network_own_contacts on public.property_network_contacts for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy property_network_read_contact_links on public.property_network_contact_links for select to authenticated
 using(owner_id=(select auth.uid()));
create policy property_network_add_contact_link on public.property_network_contact_links for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy property_network_remove_contact_link on public.property_network_contact_links for delete to authenticated
 using(owner_id=(select auth.uid()));

-- AI assistant tokens can neither read nor write private contacts.
create policy "Assistants cannot read" on public.property_network_contacts as restrictive for select to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_contacts as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_contacts as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_contacts as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot read" on public.property_network_contact_links as restrictive for select to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_contact_links as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_contact_links as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_contact_links as restrictive for delete to public using (not public.is_assistant_token());

-- Like link_property_network_provider: the service and its new contact link
-- commit together under the caller's normal RLS rules.
create function public.link_property_network_contact(p_area text,p_service text,p_name text,p_contact uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid();
begin
 perform public.refuse_assistant_token();
 if actor is null then raise exception 'Sign in to link a contact'; end if;
 insert into public.property_network_services(owner_id,area,service_key,name,status)
 values(actor,p_area,p_service,btrim(p_name),'has_provider')
 on conflict(owner_id,area,service_key) do update set status='has_provider';
 insert into public.property_network_contact_links(owner_id,area,service_key,contact_id)
 values(actor,p_area,p_service,p_contact)
 on conflict do nothing;
end $$;
revoke all on function public.link_property_network_contact(text,text,text,uuid) from public,anon;
grant execute on function public.link_property_network_contact(text,text,text,uuid) to authenticated;

-- "They've joined": link the member to every service the contact covers, then
-- delete the contact (and its links). All or nothing.
create function public.replace_property_network_contact(p_contact uuid,p_provider uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid();
begin
 perform public.refuse_assistant_token();
 if actor is null or p_provider=actor then raise exception 'Choose an available provider'; end if;
 if not exists(select 1 from public.property_network_contacts where id=p_contact and owner_id=actor)
 then raise exception 'Contact not found' using errcode='P0002'; end if;
 update public.property_network_services s set status='has_provider'
 from public.property_network_contact_links l
 where l.contact_id=p_contact and l.owner_id=actor
  and s.owner_id=l.owner_id and s.area=l.area and s.service_key=l.service_key;
 insert into public.property_network_providers(owner_id,area,service_key,provider_id)
 select owner_id,area,service_key,p_provider from public.property_network_contact_links
 where contact_id=p_contact and owner_id=actor
 on conflict do nothing;
 delete from public.property_network_contacts where id=p_contact and owner_id=actor;
end $$;
revoke all on function public.replace_property_network_contact(uuid,uuid) from public,anon;
grant execute on function public.replace_property_network_contact(uuid,uuid) to authenticated;

commit;
