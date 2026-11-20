-- My Property Network, simpler setup: a service can be marked "sorted" without
-- saying who does it. Existing statuses keep their meaning (self and
-- has_provider also read as Sorted), so no rows are rewritten.
begin;
alter table public.property_network_services drop constraint property_network_services_status_check;
alter table public.property_network_services add constraint property_network_services_status_check
 check (status in ('sorted','has_provider','self','needs_help','irrelevant'));
commit;
