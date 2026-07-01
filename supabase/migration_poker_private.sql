-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Migration 2/3: PRIVATE & SECRET state (hole cards, deck, settlements, incidents)
-- ════════════════════════════════════════════════════════════════════════════════════
-- This is the #1 privacy boundary (security-model §2, SECURITY-HOLE-CARDS-001):
--
--   • poker_hole_cards  → RLS READ-OWN only (USING user_id = auth.uid()); NEVER published.
--   • poker_deck        → NO SELECT POLICY AT ALL (stricter than read-own — even the owning
--                         player cannot read future/undealt cards or the seed); NEVER published.
--   • poker_hand_settlements → opaque idempotency lock + payout audit (no client policy).
--   • poker_incidents   → admin/audit only; opaque to clients (no policy).
--
-- A private card, an undealt card, or the shuffle seed must never appear in a public payload,
-- a realtime broadcast, a spectator view, a log, or any response to a request not authenticated
-- as that exact player. Enforced STRUCTURALLY here (RLS + no-policy + no-publication), not by
-- convention. Apply AFTER poker_core.sql. Idempotent, additive, non-destructive.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Hole cards — one row per (hand, seat); readable ONLY by the owning user ─────────
CREATE TABLE IF NOT EXISTS public.poker_hole_cards (
  hand_id    uuid NOT NULL REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  table_id   uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  seat_index int  NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cards      jsonb NOT NULL,  -- exactly two cards, e.g. ["As","Kd"]
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hand_id, seat_index),
  CHECK (jsonb_typeof(cards) = 'array' AND jsonb_array_length(cards) = 2)
);
CREATE INDEX IF NOT EXISTS poker_hole_cards_user_idx ON public.poker_hole_cards (user_id, hand_id);

-- ── 2. Deck — the shuffled stub, deal pointer, burns, and seed. SERVER-ONLY. ───────────
-- This holds every UNDEALT card plus the seed that reproduces the whole shuffle. It must be
-- unreadable by ANY browser client, including the player at the table.
CREATE TABLE IF NOT EXISTS public.poker_deck (
  hand_id     uuid PRIMARY KEY REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  table_id    uuid NOT NULL REFERENCES public.poker_tables(id) ON DELETE CASCADE,
  stub        jsonb NOT NULL,                 -- full 52-card shuffled order (or remaining stub)
  deal_index  int   NOT NULL DEFAULT 0 CHECK (deal_index >= 0),  -- server-side deal pointer
  burns       jsonb NOT NULL DEFAULT '[]'::jsonb,
  seed        bigint NOT NULL,                -- CSPRNG seed → replayable (ENGINE-REPLAY-001)
  commit_hash text,                           -- reserved for future provably-fair commit-reveal
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Settlement lock + payout audit. Idempotency keyed on hand_id (PK). ──────────────
-- One row == "this hand's pot/refund has been resolved exactly once". A second settle/refund
-- attempt hits ON CONFLICT DO NOTHING and moves NO coins (COIN-IDEMPOTENCY-001, B1).
CREATE TABLE IF NOT EXISTS public.poker_hand_settlements (
  hand_id           uuid PRIMARY KEY REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  table_id          uuid NOT NULL,
  kind              text NOT NULL DEFAULT 'settle' CHECK (kind IN ('settle','refund')),
  payouts           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{seatIndex,amount}] (settle) or refunds
  total_contributed bigint NOT NULL DEFAULT 0,
  settled_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Incidents / admin audit log. Freezes, refunds, abandonment, admin actions. ─────
-- Opaque to clients (no policy). Surfaced only via service-role admin tooling, and audited.
CREATE TABLE IF NOT EXISTS public.poker_incidents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  hand_id    uuid REFERENCES public.poker_hands(id) ON DELETE SET NULL,
  kind       text NOT NULL,            -- e.g. 'pause_for_review','refund','reaper_settle','admin_resolve'
  severity   text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- MUST NOT contain hole cards / deck cards
  actor      uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- admin who acted (if any)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poker_incidents_table_idx ON public.poker_incidents (table_id, created_at DESC);

-- ── 5. Row Level Security ─────────────────────────────────────────────────────────────
ALTER TABLE public.poker_hole_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_deck             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_hand_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_incidents        ENABLE ROW LEVEL SECURITY;

-- Hole cards: READ-OWN ONLY. The single permitted client read path (fetchMyHoleCards uses the
-- anon RLS client) — opponents' cards can never traverse the wire even if server code is wrong.
DROP POLICY IF EXISTS poker_hole_cards_read_own ON public.poker_hole_cards;
CREATE POLICY poker_hole_cards_read_own ON public.poker_hole_cards
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- poker_deck: NO POLICY. RLS enabled + zero policies → no anon/authenticated row is ever
-- visible. Service role bypasses RLS for dealing. (This is the stricter-than-read-own rule.)
-- poker_hand_settlements: NO POLICY (opaque).
-- poker_incidents: NO POLICY (opaque; admin tooling reads via service role only).

-- ── 6. Lock down direct writes AND reads where required ───────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.poker_hole_cards       FROM anon, authenticated;
REVOKE ALL                    ON public.poker_deck             FROM anon, authenticated;  -- no read, no write
REVOKE ALL                    ON public.poker_hand_settlements FROM anon, authenticated;
REVOKE ALL                    ON public.poker_incidents        FROM anon, authenticated;

-- ── 7. Realtime: explicitly assert these are NOT in the publication ───────────────────
-- (Defensive: if a prior run or human error added them, remove them. They must never sync.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poker_hole_cards','poker_deck','poker_hand_settlements','poker_incidents'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
