-- TLMN — Achievements, Leaderboard & per-player statistics.
--
-- Adds a server-authoritative aggregate stats layer ON TOP of the already-authoritative
-- round settlement (migration_tlmn_run7_economy.sql). The coin balance source of truth
-- stays public.game_wallets.balance — this migration does NOT create a second balance.
--
-- SECURITY MODEL (must stay true):
--   • Stats are written ONLY by record_tlmn_round() (SECURITY DEFINER, service_role only).
--     The browser can never increment a win — record_tlmn_round is REVOKEd from clients.
--   • Idempotent: tlmn_stat_records (room_id, round_number) PK records each completed round
--     EXACTLY once; reconnects / retries / double-finalisation can't double-count.
--   • Public read: game_player_stats is safe aggregate data (no email, no auth metadata),
--     readable by everyone via RLS. The two leaderboard RPCs are SECURITY DEFINER and
--     return only safe public fields joined from profiles.
--   • game_key = 'tlmn' (stable) so this generalises to other games later.

-- ── 1. Aggregate per-player stats ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_player_stats (
  user_id           uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key          text    NOT NULL,
  total_games       bigint  NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  total_wins        bigint  NOT NULL DEFAULT 0 CHECK (total_wins  >= 0),
  total_losses      bigint  NOT NULL DEFAULT 0 CHECK (total_losses >= 0),
  total_draws       bigint  NOT NULL DEFAULT 0 CHECK (total_draws  >= 0),
  current_win_streak integer NOT NULL DEFAULT 0,
  best_win_streak    integer NOT NULL DEFAULT 0,
  last_played_at     timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_key)
);

-- Once-only lock: one row per completed (room_id, round_number). Its existence means that
-- round's stats were already folded in — record_tlmn_round becomes a no-op on retry.
CREATE TABLE IF NOT EXISTS public.tlmn_stat_records (
  room_id      uuid NOT NULL,
  round_number int  NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, round_number)
);

-- ── 2. Indexes — ranking is done in Postgres, never in the browser ─────────────────
-- Wins board: ORDER BY total_wins DESC, win_rate DESC, total_games DESC, user_id.
CREATE INDEX IF NOT EXISTS game_player_stats_wins_idx
  ON public.game_player_stats (game_key, total_wins DESC, total_games DESC);
-- Coins board orders by game_wallets.balance; index it for the top-N scan.
CREATE INDEX IF NOT EXISTS game_wallets_balance_idx
  ON public.game_wallets (balance DESC);

-- ── 3. updated_at trigger (reuse the TLMN touch function) ──────────────────────────
DROP TRIGGER IF EXISTS trg_game_player_stats_updated_at ON public.game_player_stats;
CREATE TRIGGER trg_game_player_stats_updated_at
  BEFORE UPDATE ON public.game_player_stats
  FOR EACH ROW EXECUTE FUNCTION public.tlmn_touch_updated_at();

-- ── 4. RLS — public read of safe aggregate stats; NO client writes ─────────────────
ALTER TABLE public.game_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tlmn_stat_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_player_stats_read_all" ON public.game_player_stats;
CREATE POLICY "game_player_stats_read_all" ON public.game_player_stats
  FOR SELECT TO anon, authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy → only the SECURITY DEFINER RPC can mutate.

-- tlmn_stat_records: RLS on, NO policies → opaque to clients (definer only).

-- ── 5. record_tlmn_round() — the ONLY way stats change (service_role only) ──────────
-- p_players: jsonb array of REAL (authenticated, non-bot) participant user_ids that were
-- seated when the round ended, e.g. ["uuid","uuid"]. p_winner: the winning real player's
-- user_id, or NULL (e.g. a bot/AFK-takeover seat won — round still counts as a game for
-- the humans but nobody scores the win). Idempotent via tlmn_stat_records. Streaks are
-- recomputed transactionally: a win extends current+best; a non-win resets current to 0.
CREATE OR REPLACE FUNCTION public.record_tlmn_round(
  p_room_id      uuid,
  p_round_number int,
  p_winner       uuid,
  p_players      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key  text := 'tlmn';
  v_uid  uuid;
  v_won  boolean;
  v_count int := 0;
BEGIN
  -- Once-only lock: if the row already exists this round was already recorded.
  INSERT INTO public.tlmn_stat_records (room_id, round_number)
    VALUES (p_room_id, p_round_number)
    ON CONFLICT (room_id, round_number) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'players', 0);
  END IF;

  -- Deterministic lock order (by user_id) to avoid deadlocks between concurrent rounds.
  FOR v_uid IN
    SELECT DISTINCT (e->>0)::uuid
    FROM jsonb_array_elements_text(p_players) e
    ORDER BY 1
  LOOP
    CONTINUE WHEN v_uid IS NULL;
    v_won := (p_winner IS NOT NULL AND v_uid = p_winner);

    INSERT INTO public.game_player_stats AS s
      (user_id, game_key, total_games, total_wins, total_losses,
       current_win_streak, best_win_streak, last_played_at)
    VALUES
      (v_uid, v_key, 1, CASE WHEN v_won THEN 1 ELSE 0 END, CASE WHEN v_won THEN 0 ELSE 1 END,
       CASE WHEN v_won THEN 1 ELSE 0 END, CASE WHEN v_won THEN 1 ELSE 0 END, now())
    ON CONFLICT (user_id, game_key) DO UPDATE SET
      total_games  = s.total_games  + 1,
      total_wins   = s.total_wins   + CASE WHEN v_won THEN 1 ELSE 0 END,
      total_losses = s.total_losses + CASE WHEN v_won THEN 0 ELSE 1 END,
      current_win_streak = CASE WHEN v_won THEN s.current_win_streak + 1 ELSE 0 END,
      best_win_streak    = CASE WHEN v_won THEN GREATEST(s.best_win_streak, s.current_win_streak + 1)
                                ELSE s.best_win_streak END,
      last_played_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('recorded', true, 'players', v_count);
END;
$$;

-- ── 6. Leaderboard RPCs — ranked & paginated IN POSTGRES, safe public fields only ──
-- Most victories. Tie-break: total_wins DESC, win_rate DESC, total_games DESC, user_id ASC
-- (user_id is the stable deterministic final tie-breaker). Only players with ≥1 game.
CREATE OR REPLACE FUNCTION public.tlmn_wins_leaderboard(p_limit int, p_offset int)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  total_games  bigint,
  total_wins   bigint,
  total_losses bigint,
  win_rate     numeric,
  balance      bigint,
  rank         bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.user_id,
    p.display_name,
    p.avatar_url,
    s.total_games,
    s.total_wins,
    s.total_losses,
    CASE WHEN s.total_games > 0
         THEN round(s.total_wins * 100.0 / s.total_games, 1)
         ELSE 0 END AS win_rate,
    COALESCE(w.balance, 0) AS balance,
    row_number() OVER (
      ORDER BY s.total_wins DESC,
               CASE WHEN s.total_games > 0 THEN s.total_wins::numeric / s.total_games ELSE 0 END DESC,
               s.total_games DESC,
               s.user_id ASC
    ) + GREATEST(p_offset, 0) AS rank
  FROM public.game_player_stats s
  LEFT JOIN public.profiles     p ON p.id = s.user_id
  LEFT JOIN public.game_wallets w ON w.user_id = s.user_id
  WHERE s.game_key = 'tlmn' AND s.total_games > 0
  ORDER BY s.total_wins DESC,
           CASE WHEN s.total_games > 0 THEN s.total_wins::numeric / s.total_games ELSE 0 END DESC,
           s.total_games DESC,
           s.user_id ASC
  LIMIT GREATEST(LEAST(p_limit, 100), 1) OFFSET GREATEST(p_offset, 0);
$$;

-- Most coins. Tie-break: balance DESC, total_wins DESC, user_id ASC. Only wallets > 0 so
-- empty/abandoned wallets don't pad the board. Wins/games come from stats (0 if none).
CREATE OR REPLACE FUNCTION public.tlmn_coins_leaderboard(p_limit int, p_offset int)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  total_games  bigint,
  total_wins   bigint,
  total_losses bigint,
  win_rate     numeric,
  balance      bigint,
  rank         bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    w.user_id,
    p.display_name,
    p.avatar_url,
    COALESCE(s.total_games, 0)  AS total_games,
    COALESCE(s.total_wins, 0)   AS total_wins,
    COALESCE(s.total_losses, 0) AS total_losses,
    CASE WHEN COALESCE(s.total_games, 0) > 0
         THEN round(s.total_wins * 100.0 / s.total_games, 1)
         ELSE 0 END AS win_rate,
    w.balance,
    row_number() OVER (
      ORDER BY w.balance DESC, COALESCE(s.total_wins, 0) DESC, w.user_id ASC
    ) + GREATEST(p_offset, 0) AS rank
  FROM public.game_wallets w
  LEFT JOIN public.profiles          p ON p.id = w.user_id
  LEFT JOIN public.game_player_stats s ON s.user_id = w.user_id AND s.game_key = 'tlmn'
  WHERE w.balance > 0
  ORDER BY w.balance DESC, COALESCE(s.total_wins, 0) DESC, w.user_id ASC
  LIMIT GREATEST(LEAST(p_limit, 100), 1) OFFSET GREATEST(p_offset, 0);
$$;

-- ── 6b. Public coin balances (batch) — drives opponents' coin-rank badges in-game ──
-- Returns ONLY (user_id, balance) for the requested users (never email/auth metadata).
-- Tier is derived from this CURRENT balance on the client (single source of truth in TS),
-- so badges upgrade/downgrade live. Authenticated-only (a signed-in player seeing the coin
-- standing of opponents at the table / in the lobby) — never exposed to anon. Capped at 64
-- ids per call. game_wallets RLS only lets a user read their OWN row directly; this definer
-- function is the controlled, minimal public surface for others' standing.
CREATE OR REPLACE FUNCTION public.tlmn_public_balances(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, balance bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.user_id, w.balance
  FROM public.game_wallets w
  WHERE w.user_id = ANY (p_user_ids[1:64]);
$$;

-- ── 7. Grants — least privilege ───────────────────────────────────────────────────
-- record_tlmn_round: trusted server path ONLY (the browser must never call it).
REVOKE ALL ON FUNCTION public.record_tlmn_round(uuid, int, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_tlmn_round(uuid, int, uuid, jsonb) TO service_role;

-- Leaderboard reads: public (anon + authenticated). Definer returns only safe fields.
REVOKE ALL ON FUNCTION public.tlmn_wins_leaderboard(int, int)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tlmn_coins_leaderboard(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tlmn_wins_leaderboard(int, int)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tlmn_coins_leaderboard(int, int) TO anon, authenticated;

-- Public balances: signed-in players only (opponent / lobby-host badges).
REVOKE ALL ON FUNCTION public.tlmn_public_balances(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tlmn_public_balances(uuid[]) TO authenticated;

-- ── 8. Realtime — stream a user's OWN wallet so the coin badge updates live ─────────
-- RLS keeps the stream self-scoped (a user only receives changes to their own row). The
-- header / in-game badge recomputes the tier from the new balance instantly. Guarded so a
-- re-run never errors if the table is already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_wallets;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
