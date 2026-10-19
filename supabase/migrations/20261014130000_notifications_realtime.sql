-- Live notification updates for Home, Activity badges and the inbox.
-- Existing per-user notification RLS controls which rows subscribers receive.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
