-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Social safety: PLAYER REPORTS & BLOCKS (player-facing ecosystem, Phase UI)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Additive, idempotent, non-destructive. No existing table is altered. Apply any time after
-- migration_poker_core.sql. The app degrades safely if this is not yet applied (the report /
-- block server actions catch the missing-relation error and return a coded result the UI
-- translates) — so deploying the code before applying this migration never breaks gameplay.
--
-- • poker_player_reports — a reporter flags another player. Moderators read via service role.
--     Self-serve RLS: a user may INSERT their OWN report and SELECT their OWN reports only.
-- • poker_player_blocks  — a user mutes another player's chat for themselves. Fully self-scoped.
--     The block is a CLIENT-SIDE chat filter today (no server fan-out changes); persisting it
--     lets the preference follow the user across devices and sessions.
--
-- Both reuse auth.uid() exactly like the rest of the poker security spine. No service-role
-- writes are required from the client path.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── poker_player_reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poker_player_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id        uuid REFERENCES public.poker_tables(id) ON DELETE SET NULL,
  reason          text NOT NULL CHECK (reason IN ('cheating','abuse','collusion','spam','other')),
  note            text CHECK (note IS NULL OR char_length(note) <= 1000),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS poker_player_reports_reported_idx ON public.poker_player_reports (reported_id, created_at DESC);
CREATE INDEX IF NOT EXISTS poker_player_reports_reporter_idx ON public.poker_player_reports (reporter_id, created_at DESC);

ALTER TABLE public.poker_player_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poker_reports_insert_own ON public.poker_player_reports;
CREATE POLICY poker_reports_insert_own ON public.poker_player_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND reported_id <> auth.uid());

DROP POLICY IF EXISTS poker_reports_read_own ON public.poker_player_reports;
CREATE POLICY poker_reports_read_own ON public.poker_player_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- ── poker_player_blocks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poker_player_blocks (
  blocker_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.poker_player_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poker_blocks_rw_own ON public.poker_player_blocks;
CREATE POLICY poker_blocks_rw_own ON public.poker_player_blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- ── Grants (RLS still applies; these just permit the verbs the policies allow) ──────────
GRANT SELECT, INSERT ON public.poker_player_reports TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.poker_player_blocks TO authenticated;

-- Reports are moderator-only beyond the reporter's own rows; never grant broad SELECT to anon.
REVOKE ALL ON public.poker_player_reports FROM anon;
REVOKE ALL ON public.poker_player_blocks  FROM anon;
