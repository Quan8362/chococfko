-- ============================================================================
-- Explore Platform — Distributed (DB-backed) rate limiting
--
-- Replaces the per-instance in-memory limiter for abuse-prone user writes
-- (reports, questions, answers, helpful-marking, etc.). Atomic fixed-window
-- counter shared across all serverless instances.
--
-- PRIVACY: `subject` is an OPAQUE, already-hashed key produced by the app
-- (e.g. sha256("report:" + userId)). Raw IPs and user IDs are never stored here.
--
-- SAFETY: additive + idempotent. Direct table access is denied by RLS; only the
-- SECURITY DEFINER function `rate_limit_hit()` may touch it.
-- ROLLBACK: drop function public.rate_limit_hit(text,int,int);
--           drop function public.rate_limit_cleanup();
--           drop table if exists public.rate_limit_hits;
-- ============================================================================

create table if not exists public.rate_limit_hits (
  subject      text        not null,            -- opaque hashed "action:subjecthash"
  window_start timestamptz not null,            -- fixed-window bucket start
  count        integer     not null default 0,
  primary key (subject, window_start)
);

create index if not exists rate_limit_hits_window_idx
  on public.rate_limit_hits (window_start);

-- Lock down: RLS on, NO policies → no direct row access for anon/authenticated.
-- All access flows through the SECURITY DEFINER function below.
alter table public.rate_limit_hits enable row level security;

-- Atomic increment-and-check. Returns the post-increment count for the current
-- window and whether the caller is still under `p_limit`.
create or replace function public.rate_limit_hit(
  p_subject        text,
  p_window_seconds integer,
  p_limit          integer
)
returns table (allowed boolean, current_count integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket  timestamptz;
  v_count   integer;
  v_next    timestamptz;
begin
  if p_subject is null or length(p_subject) = 0 or p_window_seconds <= 0 or p_limit <= 0 then
    -- Defensive: never hard-fail the caller on bad params; treat as allowed.
    return query select true, 0, 0;
    return;
  end if;

  -- Bucket = floor(epoch / window) * window
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_hits (subject, window_start, count)
  values (p_subject, v_bucket, 1)
  on conflict (subject, window_start)
  do update set count = public.rate_limit_hits.count + 1
  returning count into v_count;

  v_next := v_bucket + make_interval(secs => p_window_seconds);

  return query select
    (v_count <= p_limit) as allowed,
    v_count as current_count,
    case when v_count <= p_limit then 0
         else greatest(1, ceil(extract(epoch from (v_next - now())))::integer) end as retry_after;
end;
$$;

-- Callable by logged-in users and guests (guests use a bounded hashed token).
grant execute on function public.rate_limit_hit(text, integer, integer) to authenticated, anon;

-- Bounded cleanup of stale buckets. Safe to call from cron or admin.
create or replace function public.rate_limit_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.rate_limit_hits
   where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.rate_limit_cleanup() from public, anon, authenticated;

notify pgrst, 'reload schema';
