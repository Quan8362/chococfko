-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration: SEAT-EVENTS LOG for the ratholing / rejoin policy (no coin movement)
-- ════════════════════════════════════════════════════════════════════════════════════
-- PENDING — NOT YET APPLIED. Apply AFTER the existing poker migrations. Rollback:
-- migration_poker_seat_departures_rollback.sql.
--
-- WHAT THIS DOES: an append-only log of seat lifecycle events (join / stand_up / disconnect /
-- busted) with the retained stack at departure. The authoritative server actions
-- (app/games/poker/actions.ts) write one row per event via the service role; the pure rathole
-- guard (lib/games/poker/ratholing.ts, wired in app/games/poker/economy-server.ts) reads it to
-- enforce the retained-stack and rapid-rejoin rules SERVER-SIDE.
--
-- WHAT THIS DELIBERATELY DOES **NOT** DO: it NEVER moves coins, NEVER touches game_wallets /
-- coin_ledger / poker_hand_settlements, and stores NO cards / decks / seeds / secrets. It is a
-- pure policy-telemetry table. Until applied, the guard fails OPEN (the buy-in bounds in
-- poker_sit_down / poker_rebuy still enforce), so nothing regresses.
--
-- ADDITIVE + IDEMPOTENT + NON-DESTRUCTIVE.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.poker_seat_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_index     int  NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('join','stand_up','disconnect','busted')),
  stack_at_leave bigint NOT NULL DEFAULT 0 CHECK (stack_at_leave >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The guard reads the most recent events for a (table,user) pair inside a short window.
CREATE INDEX IF NOT EXISTS poker_seat_events_lookup_idx
  ON public.poker_seat_events (table_id, user_id, created_at DESC);

-- Append-only: block UPDATE/DELETE so the policy trail is tamper-evident.
CREATE OR REPLACE FUNCTION public.poker_seat_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'poker_seat_events is append-only (% blocked)', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS trg_poker_seat_events_immutable ON public.poker_seat_events;
CREATE TRIGGER trg_poker_seat_events_immutable
  BEFORE UPDATE OR DELETE ON public.poker_seat_events
  FOR EACH ROW EXECUTE FUNCTION public.poker_seat_events_immutable();

-- ── RLS — read-own only; NO client write policy (service role inserts from the action layer) ──
ALTER TABLE public.poker_seat_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poker_seat_events_read_own" ON public.poker_seat_events;
CREATE POLICY "poker_seat_events_read_own" ON public.poker_seat_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy → anon/authenticated cannot write. The service role (admin
-- client) bypasses RLS to append rows. Explicitly revoke writes for defence in depth.
REVOKE INSERT, UPDATE, DELETE ON public.poker_seat_events FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
