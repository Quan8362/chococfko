-- ============================================================================
-- Explore Platform — Scheduled-notification delivery dedup log
--
-- The return-user cron (/api/cron/return-user) sends plan_reminder + event_soon
-- notifications. Without a durable log, every cron tick re-notifies the same
-- recipients for the same window. This table records each (user, type, entity,
-- window) delivery exactly once so retries / overlapping ticks cannot duplicate.
--
-- An in-memory dedupe is unsafe here: cron runs on fresh serverless instances.
--
-- SAFETY: additive + idempotent. Service-role only (RLS on, no policies).
-- ROLLBACK: drop function public.try_mark_notification_delivery(text,text,text,text);
--           drop table if exists public.notification_delivery_log;
-- ============================================================================

create table if not exists public.notification_delivery_log (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,            -- e.g. plan_reminder | event_soon
  entity_key  text        not null,            -- e.g. plan id / event id
  window_key  text        not null,            -- e.g. JST date or window bucket
  created_at  timestamptz not null default now(),
  primary key (user_id, type, entity_key, window_key)
);

create index if not exists notification_delivery_log_created_idx
  on public.notification_delivery_log (created_at);

alter table public.notification_delivery_log enable row level security;
-- No policies: only the service role (cron) writes/reads via the function below.

-- Returns TRUE if this is the first time we claim (user,type,entity,window) —
-- i.e. it is safe to send. Returns FALSE if it was already delivered. Atomic via
-- INSERT ... ON CONFLICT DO NOTHING.
create or replace function public.try_mark_notification_delivery(
  p_user_id    uuid,
  p_type       text,
  p_entity_key text,
  p_window_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer;
begin
  insert into public.notification_delivery_log (user_id, type, entity_key, window_key)
  values (p_user_id, p_type, p_entity_key, p_window_key)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke execute on function public.try_mark_notification_delivery(uuid, text, text, text)
  from public, anon, authenticated;

-- Bounded cleanup of old delivery rows (safe to call from cron/admin).
create or replace function public.notification_delivery_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.notification_delivery_log
   where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.notification_delivery_cleanup()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
