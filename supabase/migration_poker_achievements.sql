-- ════════════════════════════════════════════════════════════════════════════════════
-- POKER — Social layer 1: ACHIEVEMENTS & MISSIONS (cosmetic, server-authoritative)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Additive, idempotent, non-destructive. Creates ONLY new poker_achievements / poker_missions /
-- poker_player_progress / poker_hand_progress_records / poker_reconnect_events objects and two
-- SECURITY DEFINER recording RPCs. Touches NO existing poker / TLMN / Caro / wallet data.
--
-- 🔴 ZERO COIN MOVEMENT. Nothing here reads, writes, or references game_wallets / coin_ledger /
-- any stack or buy-in. An unlock is a COSMETIC BADGE and a mission is a checklist tick — there is
-- no faucet, no grant, no transfer. Poker settlement stays exactly zero-sum. This is what makes
-- "reward safety" trivial: the only failure mode is unlocking a badge twice, which the UNIQUE
-- unlock row + ON CONFLICT DO NOTHING makes impossible.
--
-- SERVER-AUTHORITATIVE. The browser can never write an unlock or mission progress: every mutating
-- object is written ONLY by the service_role via these DEFINER RPCs, called from the trusted
-- settlement path (app/games/poker/progress-record.ts) and from idempotent player actions
-- (app/games/poker/social.ts). Clients get read-own SELECT and nothing else — except a single
-- self-scoped INSERT on poker_reconnect_events (a device-local "my socket dropped this hand"
-- marker the settlement recorder consults; it grants no badge by itself).
--
-- DEGRADE-SAFE. The app catches the missing-relation error (42P01) and returns a coded result the
-- UI translates, so deploying the code before applying this migration never breaks gameplay.
--
-- Apply AFTER: poker_core → poker_private → poker_economy → poker_lifecycle → poker_engine.
-- Rollback: migration_poker_achievements_rollback.sql (drops ONLY the objects created here).
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── 1. poker_achievements — one immutable unlock row per (user, achievement) ────────────
-- The UNIQUE (user_id, achievement_key) is the idempotency guarantee: an unlock can be recorded
-- any number of times and exists exactly once. achievement_key is free text validated against the
-- pure catalog in the app layer (lib/games/poker/achievements.ts) — NOT a DB enum, so new badges
-- never need a schema migration.
CREATE TABLE IF NOT EXISTS public.poker_achievements (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key  text NOT NULL CHECK (char_length(achievement_key) BETWEEN 1 AND 64),
  hand_id          uuid REFERENCES public.poker_hands(id) ON DELETE SET NULL, -- the hand that earned it (audit)
  unlocked_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS poker_achievements_user_idx ON public.poker_achievements (user_id, unlocked_at DESC);

-- ── 2. poker_missions — per (user, mission, period) progress, clamped at target ─────────
-- period_key is 'once' for the launch checklist (missions never reset); the column exists so a
-- future rotating mission can coexist WITHOUT altering these rows. completed_at latches (set once
-- when progress first reaches target, never cleared).
CREATE TABLE IF NOT EXISTS public.poker_missions (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_key   text NOT NULL CHECK (char_length(mission_key) BETWEEN 1 AND 64),
  period_key    text NOT NULL DEFAULT 'once' CHECK (char_length(period_key) BETWEEN 1 AND 32),
  progress      integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target        integer NOT NULL CHECK (target >= 1),
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_key, period_key),
  CHECK (progress <= target)
);
CREATE INDEX IF NOT EXISTS poker_missions_user_idx ON public.poker_missions (user_id);

-- ── 3. poker_player_progress — denormalized cumulative counters (drives milestones) ─────
-- One row per user. hands_played is the authoritative counter the milestone achievements read;
-- it is incremented exactly once per hand under the idempotency lock in §4.
CREATE TABLE IF NOT EXISTS public.poker_player_progress (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hands_played  bigint NOT NULL DEFAULT 0 CHECK (hands_played >= 0),
  showdowns     bigint NOT NULL DEFAULT 0 CHECK (showdowns >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 4. poker_hand_progress_records — the once-only lock (existence = "already folded in") ─
-- The recorder inserts (hand_id) FIRST; if the row already exists it returns without doing any
-- work, so a re-settlement or a duplicate call can never double-count a hand or re-run milestones.
CREATE TABLE IF NOT EXISTS public.poker_hand_progress_records (
  hand_id       uuid PRIMARY KEY REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 5. poker_reconnect_events — self-scoped "my socket dropped during this hand" marker ─
-- The ONLY client-writable table here. The realtime hook inserts (hand_id) when it recovers a
-- dropped channel while the viewer is seated in a live hand. It grants nothing on its own; the
-- settlement recorder consults it to award the `reconnect_finish` badge to a player who both
-- reconnected AND finished the hand. PK dedupes repeat reconnects in the same hand.
CREATE TABLE IF NOT EXISTS public.poker_reconnect_events (
  hand_id       uuid NOT NULL REFERENCES public.poker_hands(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hand_id, user_id)
);

-- ── 6. Row-Level Security ───────────────────────────────────────────────────────────────
ALTER TABLE public.poker_achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_missions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_player_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_hand_progress_records ENABLE ROW LEVEL SECURITY; -- RLS on, NO policy → opaque
ALTER TABLE public.poker_reconnect_events   ENABLE ROW LEVEL SECURITY;

-- Read-own on the three player-facing tables (writes are DEFINER-only, no client write policy).
DROP POLICY IF EXISTS poker_ach_read_own ON public.poker_achievements;
CREATE POLICY poker_ach_read_own ON public.poker_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS poker_mis_read_own ON public.poker_missions;
CREATE POLICY poker_mis_read_own ON public.poker_missions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS poker_prog_read_own ON public.poker_player_progress;
CREATE POLICY poker_prog_read_own ON public.poker_player_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Reconnect marker: a user may INSERT and SELECT only their OWN rows.
DROP POLICY IF EXISTS poker_recon_insert_own ON public.poker_reconnect_events;
CREATE POLICY poker_recon_insert_own ON public.poker_reconnect_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS poker_recon_read_own ON public.poker_reconnect_events;
CREATE POLICY poker_recon_read_own ON public.poker_reconnect_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Table grants (RLS still applies; these just permit the verbs the policies allow).
REVOKE ALL ON public.poker_achievements          FROM anon;
REVOKE ALL ON public.poker_missions              FROM anon;
REVOKE ALL ON public.poker_player_progress       FROM anon;
REVOKE ALL ON public.poker_hand_progress_records FROM anon, authenticated; -- opaque lock table
REVOKE ALL ON public.poker_reconnect_events      FROM anon;
GRANT SELECT         ON public.poker_achievements       TO authenticated;
GRANT SELECT         ON public.poker_missions           TO authenticated;
GRANT SELECT         ON public.poker_player_progress    TO authenticated;
GRANT SELECT, INSERT ON public.poker_reconnect_events   TO authenticated;

-- ── 7. Internal helper: apply one mission increment (clamped, latching) ─────────────────
-- Mirrors the pure reducer in lib/games/poker/missions.ts EXACTLY: progress clamps to target,
-- completed_at latches. A non-positive increment is a no-op (never creates an empty row).
CREATE OR REPLACE FUNCTION public.poker_apply_mission(
  p_user_id     uuid,
  p_mission_key text,
  p_inc         integer,
  p_target      integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_inc IS NULL OR p_inc <= 0 OR p_target IS NULL OR p_target < 1 THEN
    RETURN;
  END IF;
  INSERT INTO public.poker_missions (user_id, mission_key, period_key, progress, target, completed_at)
  VALUES (
    p_user_id, p_mission_key, 'once',
    LEAST(p_target, p_inc), p_target,
    CASE WHEN LEAST(p_target, p_inc) >= p_target THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, mission_key, period_key) DO UPDATE
  SET progress     = LEAST(poker_missions.target, poker_missions.progress + p_inc),
      completed_at = COALESCE(
        poker_missions.completed_at,
        CASE WHEN LEAST(poker_missions.target, poker_missions.progress + p_inc)
                  >= poker_missions.target THEN now() ELSE NULL END
      ),
      updated_at   = now();
END;
$$;

-- ── 8. poker_record_hand_progress — the once-per-hand settlement recorder ───────────────
-- p_entries : jsonb array, one object per participating user:
--   { "user_id": uuid,
--     "achievements": [text,...],                 -- unconditional unlocks
--     "counts_hand": bool,                         -- increment hands_played (+ maybe showdowns)
--     "reached_showdown": bool,                    -- bump the showdowns counter
--     "milestones": [ {"key":text,"at":int}, ... ],-- unlock when hands_played >= at
--     "missions": [ {"key":text,"inc":int,"target":int}, ... ] }
-- Idempotent at HAND granularity via the lock table. Entries are processed in user_id order so
-- concurrent recorders for different hands take row locks in a consistent order (deadlock-safe).
-- Moves NO coins. Returns { recorded: bool }.
CREATE OR REPLACE FUNCTION public.poker_record_hand_progress(
  p_hand_id uuid,
  p_entries jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry   jsonb;
  v_user    uuid;
  v_ach     text;
  v_hands   bigint;
  v_mil     jsonb;
  v_mis     jsonb;
BEGIN
  IF p_hand_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'no_hand');
  END IF;

  -- Once-only lock: if this hand was already folded in, do nothing.
  INSERT INTO public.poker_hand_progress_records (hand_id) VALUES (p_hand_id)
  ON CONFLICT (hand_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'already_recorded');
  END IF;

  FOR v_entry IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb)) AS t(value)
    ORDER BY (value->>'user_id')
  LOOP
    v_user := (v_entry->>'user_id')::uuid;
    IF v_user IS NULL THEN CONTINUE; END IF;

    -- Unconditional achievement unlocks (idempotent).
    FOR v_ach IN SELECT jsonb_array_elements_text(COALESCE(v_entry->'achievements', '[]'::jsonb))
    LOOP
      INSERT INTO public.poker_achievements (user_id, achievement_key, hand_id)
      VALUES (v_user, v_ach, p_hand_id)
      ON CONFLICT (user_id, achievement_key) DO NOTHING;
    END LOOP;

    -- Counter increment + milestone unlocks.
    IF COALESCE((v_entry->>'counts_hand')::boolean, false) THEN
      INSERT INTO public.poker_player_progress (user_id, hands_played, showdowns)
      VALUES (v_user, 1, CASE WHEN COALESCE((v_entry->>'reached_showdown')::boolean, false) THEN 1 ELSE 0 END)
      ON CONFLICT (user_id) DO UPDATE
      SET hands_played = poker_player_progress.hands_played + 1,
          showdowns    = poker_player_progress.showdowns
                         + CASE WHEN COALESCE((v_entry->>'reached_showdown')::boolean, false) THEN 1 ELSE 0 END,
          updated_at   = now()
      RETURNING hands_played INTO v_hands;

      FOR v_mil IN SELECT value FROM jsonb_array_elements(COALESCE(v_entry->'milestones', '[]'::jsonb)) AS t(value)
      LOOP
        IF v_hands >= (v_mil->>'at')::bigint THEN
          INSERT INTO public.poker_achievements (user_id, achievement_key, hand_id)
          VALUES (v_user, v_mil->>'key', p_hand_id)
          ON CONFLICT (user_id, achievement_key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- Mission increments.
    FOR v_mis IN SELECT value FROM jsonb_array_elements(COALESCE(v_entry->'missions', '[]'::jsonb)) AS t(value)
    LOOP
      PERFORM public.poker_apply_mission(
        v_user, v_mis->>'key', COALESCE((v_mis->>'inc')::int, 0), (v_mis->>'target')::int
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('recorded', true);
END;
$$;

-- ── 9. poker_bump_mission — a single action-sourced mission increment (idempotent) ──────
-- For 'action' missions (reviewed the rules, finished a trainer scenario). The eligibility is the
-- player having invoked the corresponding server action; the increment is clamped at target so
-- replaying the action farms nothing. Moves NO coins.
CREATE OR REPLACE FUNCTION public.poker_bump_mission(
  p_user_id     uuid,
  p_mission_key text,
  p_inc         integer,
  p_target      integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.poker_apply_mission(p_user_id, p_mission_key, p_inc, p_target);
END;
$$;

-- ── 10. Function grants (least privilege) ───────────────────────────────────────────────
-- Supabase grants EXECUTE to anon/authenticated BY NAME on new functions, so REVOKE FROM PUBLIC
-- alone is insufficient — name anon + authenticated explicitly. Only the service role (trusted
-- server path) may record progress.
REVOKE ALL ON FUNCTION public.poker_apply_mission(uuid, text, integer, integer)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_record_hand_progress(uuid, jsonb)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.poker_bump_mission(uuid, text, integer, integer)         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poker_apply_mission(uuid, text, integer, integer)     TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_record_hand_progress(uuid, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.poker_bump_mission(uuid, text, integer, integer)      TO service_role;

NOTIFY pgrst, 'reload schema';
