-- Move the push webhook off a hardcoded service_role JWT and onto Supabase Vault,
-- mirroring the process-email-outbox cron (20260720180000). The Supabase Database
-- Webhook (supabase_functions.http_request) baked the bearer token as a literal
-- into the trigger definition; that argument is static and can't read vault. So we
-- replace it with a trigger function that builds the request at runtime via pg_net
-- + vault.decrypted_secrets. After this, no service_role key appears in any
-- dumpable DB definition.
--
-- PREREQUISITE (see rotation runbook): Vault must already contain:
--   * service_role_key    — the CURRENT valid service-role key (bearer)
--   * push_webhook_secret — matches the send-push function's PUSH_WEBHOOK_SECRET
-- If either is absent the header is sent empty; the send-push function still gates
-- on x-webhook-secret, so a missing/mismatched secret just yields 401 (no push),
-- it never blocks the notifications insert.

create extension if not exists pg_net;

create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform net.http_post(
    url := 'https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'x-webhook-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'), '')
    ),
    body := jsonb_build_object(
      'type',   'INSERT',
      'table',  'notifications',
      'schema', 'public',
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;  -- never block the insert on a webhook failure
end;
$function$;

-- Swap the Supabase webhook trigger (which embedded the JWT) for the vault-backed one.
drop trigger if exists send_push_on_notification on public.notifications;
create trigger send_push_on_notification
  after insert on public.notifications
  for each row execute function public.notify_send_push();
