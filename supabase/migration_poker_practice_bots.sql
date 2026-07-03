-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — PRACTICE BOTS: isolated practice-game persistence (Prompt 27B)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Additive, idempotent, non-destructive. Creates ONLY the new poker_practice_games table. Touches
-- NO existing poker / TLMN / Caro / wallet data and adds NO foreign key to game_wallets,
-- coin_ledger, poker_hands, or any real-economy object.
--
-- 🔴 ZERO REAL-COIN CONTACT. Practice chips live ENTIRELY inside the `state` jsonb of a row here.
-- They are an isolated integer sandbox supply — there is no faucet into game_wallets, no ledger
-- row, no cash-out. A bug at a practice table can never move a real balance.
--
-- 🔴 SERVICE-ROLE ONLY. The `state` jsonb holds SERVER-ONLY secrets (dealt hole cards, the deck
-- stub, the deal seed). The client must NEVER read this table directly — the trusted server
-- action reads it with the service role and returns ONLY the privacy-safe per-viewer projection
-- (lib/games/poker/practice/view.ts). RLS is therefore DENY-ALL for anon/authenticated: no
-- policy is created, and SELECT/INSERT/UPDATE/DELETE are REVOKEd from anon + authenticated so the
-- secrets can never leak via PostgREST.
--
-- DEGRADE-SAFE + DARK. The feature is gated by POKER_PRACTICE_BOTS_ENABLED (default OFF). The app
-- catches the missing-relation error (42P01) and fails closed, so deploying the code BEFORE
-- applying this migration never breaks anything — the practice route simply reports unavailable.
--
-- Apply AFTER the core poker migrations (only needs auth.users). Rollback:
--   DROP TABLE IF EXISTS public.poker_practice_games;
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── poker_practice_games — one row per isolated practice game ────────────────────────────
-- `state` is the full authoritative PracticeGame (config + engine hand + isolated chips + the
-- server-only secrets). `version` mirrors the game's monotonic token for optimistic concurrency:
-- an UPDATE is guarded by `WHERE version = expected` so a duplicate/stale writer can never commit
-- a second action (the same idempotency the pure runtime enforces via actionSeq).
CREATE TABLE IF NOT EXISTS public.poker_practice_games (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- the human seat's user
  kind          text NOT NULL DEFAULT 'practice' CHECK (kind = 'practice'), -- immutable classification
  phase         text NOT NULL DEFAULT 'IDLE',
  version       integer NOT NULL DEFAULT 0,
  state         jsonb NOT NULL,          -- full PracticeGame incl. SERVER-ONLY secrets (never sent raw)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poker_practice_games_owner_idx
  ON public.poker_practice_games (owner_user_id, updated_at DESC);

-- ── Lockdown: RLS on, NO policies, and REVOKE the client roles ───────────────────────────
-- With RLS enabled and no policy, anon/authenticated get zero rows. The explicit REVOKE is belt
-- and suspenders so the server-only secrets in `state` can never be read through PostgREST. Only
-- the service_role (used exclusively by the trusted server action) can touch this table.
ALTER TABLE public.poker_practice_games ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.poker_practice_games FROM anon;
REVOKE ALL ON public.poker_practice_games FROM authenticated;

-- keep-alive touch of updated_at on every write (optional convenience; no security effect).
CREATE OR REPLACE FUNCTION public.poker_practice_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poker_practice_games_touch ON public.poker_practice_games;
CREATE TRIGGER poker_practice_games_touch
  BEFORE UPDATE ON public.poker_practice_games
  FOR EACH ROW EXECUTE FUNCTION public.poker_practice_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════════
-- END — leave PENDING (do NOT apply to production this phase; the feature ships dark).
-- ════════════════════════════════════════════════════════════════════════════════════
