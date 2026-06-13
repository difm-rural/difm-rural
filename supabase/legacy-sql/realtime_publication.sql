-- Enable realtime delivery for chat and live status updates.
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Supabase only broadcasts postgres_changes for tables in the
-- supabase_realtime publication. ChatScreen subscribes to:
--   messages                  (job chat inserts)
--   service_booking_messages  (booking chat inserts)
--   jobs / bookings           (status updates that close the chat)

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.service_booking_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; when undefined_object then null; end $$;
