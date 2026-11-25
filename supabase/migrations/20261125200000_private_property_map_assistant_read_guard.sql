-- Private Property Map: connected assistants may not read the map.
--
-- OAuth assistant tokens are ordinary `authenticated` JWTs for the member plus
-- a client_id claim, so the owner policy (owner_id = auth.uid(), FOR ALL) also
-- let an assistant read the member's exact pin, boundary, gates, tanks and
-- driveways straight through PostgREST. Writes were already refused by the
-- three restrictive policies in 20261118180000; reads were not.
--
-- The connector (rc-mcp) never reads this table and promises towns/areas
-- only, and the sibling private Property Network tables (contacts, contact
-- links, job links) already refuse assistant reads. This brings the map into
-- line. Owner app sessions (no client_id) are unaffected.
begin;

create policy "Assistants cannot read" on public.private_property_maps
 as restrictive for select to public
 using (not public.is_assistant_token());

-- Fail the migration if any guard is missing, so a partial state never ships.
do $$
begin
 if (select count(*) from pg_policies
     where schemaname='public' and tablename='private_property_maps' and permissive='RESTRICTIVE'
       and policyname in ('Assistants cannot read','Assistants cannot insert','Assistants cannot update','Assistants cannot delete'))<>4
 then raise exception 'private_property_maps is missing an assistant guard'; end if;
 if has_table_privilege('anon','public.private_property_maps','SELECT')
    or has_table_privilege('authenticated','public.private_property_maps','DELETE')
 then raise exception 'private_property_maps grants changed unexpectedly'; end if;
end $$;

commit;
