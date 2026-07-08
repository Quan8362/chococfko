-- ============================================================================
-- Poker Tournament — distributed, atomic, fail-closed rate limiting
--
-- Adds a server-side rate limiter for abuse-prone Tournament server actions
-- (submit action, table-view reconcile, next-hand ensure, register/unregister,
-- create, operator lifecycle). Distributed across all Vercel serverless
-- instances (state lives in Postgres, not process memory) and atomic under
-- concurrency (row-locked token bucket) so N concurrent requests can never
-- exceed the burst allowance.
--
-- ALGORITHM: token bucket. Each `subject` holds up to `capacity` tokens (BURST)
-- that refill at `refill_per_sec` (SUSTAINED). One request costs one token.
-- Mirrors lib/games/poker/tournamentRateLimitPolicy.ts::tokenBucketDecision.
--
-- PRIVACY: `subject` is an OPAQUE app-produced sha256 of
-- "tnmt:<family>:u:<userId>". Raw user IDs / emails / cards / seeds are never
-- stored here. Trusted server time comes from now() (DB clock), never a client.
--
-- SECURITY: RLS on with NO policies → no direct row access. The SECURITY DEFINER
-- function is the ONLY path, and it is granted to service_role ONLY (the app
-- always calls it through the server-side admin client; browser code can neither
-- reach the service role nor call this function).
--
-- SAFETY: additive + idempotent. Touches NO tournament, wallet, ledger, payout,
-- entry, seat or hand data. Forward-only.
-- ROLLBACK: see rollback_poker_tournament_rate_limits.sql
-- ============================================================================

create table if not exists public.poker_tournament_rate_limits (
  subject     text             not null primary key,   -- opaque hashed "family:subjecthash"
  tokens      double precision not null,               -- tokens available at updated_at
  updated_at  timestamptz      not null default now()  -- last-touch (server clock)
);

-- Cleanup scans by recency.
create index if not exists poker_tournament_rate_limits_updated_idx
  on public.poker_tournament_rate_limits (updated_at);

-- Lock down: RLS on, NO policies → anon/authenticated get zero direct row access.
alter table public.poker_tournament_rate_limits enable row level security;

-- ── Atomic token-bucket increment-and-check ─────────────────────────────────
-- Returns whether the caller is admitted, the tokens remaining after this
-- request, and (when rejected) the ms until one token is available again.
-- Concurrency: the insert-on-conflict-do-nothing then SELECT ... FOR UPDATE
-- serializes all concurrent hits on the same subject, so the atomic allowance
-- (capacity) can never be exceeded by a burst of parallel requests.
create or replace function public.poker_tournament_rate_limit_hit(
  p_subject         text,
  p_capacity        double precision,
  p_refill_per_sec  double precision
)
returns table (allowed boolean, tokens_after double precision, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now();   -- trusted server time (transaction start)
  v_tokens   double precision;
  v_updated  timestamptz;
  v_elapsed  double precision;
  v_refilled double precision;
begin
  -- Defensive: never hard-fail on bad params — treat as allowed so a config slip
  -- can never wedge a legitimate caller. (The app validates policies too.)
  if p_subject is null or length(p_subject) = 0 or p_capacity <= 0 or p_refill_per_sec <= 0 then
    return query select true, 0::double precision, 0;
    return;
  end if;

  -- Ensure the row exists (a brand-new subject starts with a FULL bucket), then
  -- lock it. do-nothing + FOR UPDATE is the atomic upsert-lock pattern.
  insert into public.poker_tournament_rate_limits (subject, tokens, updated_at)
  values (p_subject, p_capacity, v_now)
  on conflict (subject) do nothing;

  select tokens, updated_at into v_tokens, v_updated
  from public.poker_tournament_rate_limits
  where subject = p_subject
  for update;

  -- Continuous refill, clamped to capacity.
  v_elapsed  := greatest(0, extract(epoch from (v_now - v_updated)));
  v_refilled := least(p_capacity, v_tokens + v_elapsed * p_refill_per_sec);

  if v_refilled >= 1 then
    update public.poker_tournament_rate_limits
       set tokens = v_refilled - 1, updated_at = v_now
     where subject = p_subject;
    return query select true, (v_refilled - 1), 0;
  else
    -- Refill the clock forward but consume nothing (request rejected).
    update public.poker_tournament_rate_limits
       set tokens = v_refilled, updated_at = v_now
     where subject = p_subject;
    return query select
      false,
      v_refilled,
      greatest(1, ceil(((1 - v_refilled) / p_refill_per_sec) * 1000))::integer;
  end if;
end;
$$;

-- The app ALWAYS calls this through the server-side service-role admin client.
-- Browser roles must never reach it.
revoke all on function public.poker_tournament_rate_limit_hit(text, double precision, double precision) from public;
revoke execute on function public.poker_tournament_rate_limit_hit(text, double precision, double precision) from anon, authenticated;
grant  execute on function public.poker_tournament_rate_limit_hit(text, double precision, double precision) to service_role;

-- ── Bounded cleanup ─────────────────────────────────────────────────────────
-- An idle bucket refills to full anyway, so any subject untouched for a while is
-- safe to delete (it reappears full on the next hit). Keeps storage bounded.
create or replace function public.poker_tournament_rate_limit_cleanup(p_idle_seconds integer default 3600)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.poker_tournament_rate_limits
   where updated_at < now() - make_interval(secs => greatest(60, p_idle_seconds));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all     on function public.poker_tournament_rate_limit_cleanup(integer) from public, anon, authenticated;
grant  execute on function public.poker_tournament_rate_limit_cleanup(integer) to service_role;

notify pgrst, 'reload schema';
