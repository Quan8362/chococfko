-- ============================================================
-- Japanese 60-Second Challenge — game schema
-- Feature: app/games/japanese-60  (server-authoritative quiz game)
-- Apply manually in the Supabase SQL editor. Idempotent & non-destructive:
-- creates ONLY new jp60_* tables; never touches japanese_words/kanji/grammar.
--
-- SECURITY MODEL
--   * jp60_sessions / jp60_challenges / jp60_disabled_items hold answer keys and
--     integrity state. RLS is ENABLED with NO client policies → the anon/auth
--     keys can read nothing. ALL access goes through server actions using the
--     service-role client (createAdminClient), which bypasses RLS.
--   * User-facing tables (results, answers, stats, records, achievements,
--     participation, reports) expose ONLY the owner's own rows via auth.uid().
--   * Leaderboards are served by service-role actions returning safe DTOs
--     (display_name + avatar only) — emails / private profile data never leak.
-- ============================================================

-- ── config (singleton key/value; non-sensitive, publicly readable) ──────────
CREATE TABLE IF NOT EXISTS public.jp60_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jp60_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_config_public_read" ON public.jp60_config;
CREATE POLICY "jp60_config_public_read" ON public.jp60_config FOR SELECT USING (true);
-- writes: service role only (no insert/update/delete policy)

INSERT INTO public.jp60_config (key, value) VALUES
  ('settings', '{
     "enabled": true,
     "modes": { "daily": true, "rush": true, "practice": true },
     "levels": { "N5": true, "N4": true, "N3": true, "N2": true, "N1": true, "MIXED": true },
     "duration_sec": 60,
     "daily_questions": 10
   }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── sessions (SERVICE-ROLE ONLY — holds correct answers + integrity) ────────
CREATE TABLE IF NOT EXISTS public.jp60_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null = guest
  mode            text NOT NULL,            -- daily | rush | practice
  level           text NOT NULL,            -- N5..N1 | MIXED
  ranked          boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active', -- active | completed | expired | abandoned
  seed            bigint,
  daily_date      date,
  challenge_id    uuid,
  duration_sec    int  NOT NULL DEFAULT 60,
  timed           boolean NOT NULL DEFAULT true,
  questions       jsonb NOT NULL DEFAULT '[]'::jsonb, -- full set incl. correctKey + per-Q progress
  current_index   int  NOT NULL DEFAULT 0,
  score           int,
  accuracy        int,
  best_combo      int,
  correct_count   int,
  wrong_count     int,
  skipped_count   int,
  avg_correct_ms  int,
  xp_awarded      int  NOT NULL DEFAULT 0,
  suspicious      boolean NOT NULL DEFAULT false,
  suspicious_reason text,
  client_version  text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_sessions_user    ON public.jp60_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp60_sessions_status  ON public.jp60_sessions (status, expires_at);
ALTER TABLE public.jp60_sessions ENABLE ROW LEVEL SECURITY;
-- no policies → client keys denied; service role bypasses RLS.

-- ── results (per-session summary; owner-readable + leaderboard source) ──────
CREATE TABLE IF NOT EXISTS public.jp60_results (
  session_id     uuid PRIMARY KEY REFERENCES public.jp60_sessions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode           text NOT NULL,
  level          text NOT NULL,
  ranked         boolean NOT NULL DEFAULT false,
  score          int  NOT NULL DEFAULT 0,
  accuracy       int  NOT NULL DEFAULT 0,
  best_combo     int  NOT NULL DEFAULT 0,
  correct_count  int  NOT NULL DEFAULT 0,
  wrong_count    int  NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  avg_correct_ms int  NOT NULL DEFAULT 0,
  duration_sec   int  NOT NULL DEFAULT 0,
  daily_date     date,
  weekly_key     text,
  suspicious     boolean NOT NULL DEFAULT false,
  completed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_results_user    ON public.jp60_results (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp60_results_board   ON public.jp60_results (ranked, mode, level, score DESC, accuracy DESC, avg_correct_ms ASC, completed_at ASC) WHERE ranked AND NOT suspicious;
CREATE INDEX IF NOT EXISTS idx_jp60_results_daily   ON public.jp60_results (daily_date, level, score DESC) WHERE ranked AND NOT suspicious;
CREATE INDEX IF NOT EXISTS idx_jp60_results_weekly  ON public.jp60_results (weekly_key, score DESC) WHERE ranked AND NOT suspicious;
ALTER TABLE public.jp60_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_results_own_select" ON public.jp60_results;
CREATE POLICY "jp60_results_own_select" ON public.jp60_results FOR SELECT USING (user_id = auth.uid());
-- writes: service role only

-- ── answers (per-question audit + weak-item tracking; owner-readable) ───────
CREATE TABLE IF NOT EXISTS public.jp60_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.jp60_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idx             int  NOT NULL DEFAULT 0,
  source_type     text NOT NULL,           -- vocabulary | grammar | kanji
  source_id       text,
  q_type          text NOT NULL,
  question_text   text,
  correct_answer  text,
  selected_answer text,
  is_correct      boolean NOT NULL DEFAULT false,
  difficulty      text,
  response_ms     int,
  answered_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_answers_session ON public.jp60_answers (session_id);
CREATE INDEX IF NOT EXISTS idx_jp60_answers_weak    ON public.jp60_answers (user_id, source_type, is_correct, answered_at DESC);
ALTER TABLE public.jp60_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_answers_own_select" ON public.jp60_answers;
CREATE POLICY "jp60_answers_own_select" ON public.jp60_answers FOR SELECT USING (user_id = auth.uid());

-- ── player stats (one row per user; XP + streak + lifetime totals) ──────────
CREATE TABLE IF NOT EXISTS public.jp60_player_stats (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_games    int  NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  total_correct  int  NOT NULL DEFAULT 0,
  vocab_correct  int  NOT NULL DEFAULT 0,
  kanji_correct  int  NOT NULL DEFAULT 0,
  grammar_correct int NOT NULL DEFAULT 0,
  best_combo     int  NOT NULL DEFAULT 0,
  best_score     int  NOT NULL DEFAULT 0,
  total_xp       int  NOT NULL DEFAULT 0,
  streak_current int  NOT NULL DEFAULT 0,
  streak_longest int  NOT NULL DEFAULT 0,
  streak_last_date date,
  sum_correct_ms bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_stats_xp ON public.jp60_player_stats (total_xp DESC);
ALTER TABLE public.jp60_player_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_stats_own_select" ON public.jp60_player_stats;
CREATE POLICY "jp60_stats_own_select" ON public.jp60_player_stats FOR SELECT USING (user_id = auth.uid());

-- ── personal records (best per mode+level) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jp60_personal_records (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode         text NOT NULL,
  level        text NOT NULL,
  best_score   int  NOT NULL DEFAULT 0,
  best_accuracy int NOT NULL DEFAULT 0,
  best_combo   int  NOT NULL DEFAULT 0,
  achieved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mode, level)
);
ALTER TABLE public.jp60_personal_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_records_own_select" ON public.jp60_personal_records;
CREATE POLICY "jp60_records_own_select" ON public.jp60_personal_records FOR SELECT USING (user_id = auth.uid());

-- ── daily participation (enforces one ranked daily attempt / level) ─────────
CREATE TABLE IF NOT EXISTS public.jp60_daily_participation (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_date       date NOT NULL,
  level            text NOT NULL,
  first_session_id uuid REFERENCES public.jp60_sessions(id) ON DELETE SET NULL,
  ranked_score     int,
  ranked_accuracy  int,
  attempts         int NOT NULL DEFAULT 1,
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, daily_date, level)
);
ALTER TABLE public.jp60_daily_participation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_daily_own_select" ON public.jp60_daily_participation;
CREATE POLICY "jp60_daily_own_select" ON public.jp60_daily_participation FOR SELECT USING (user_id = auth.uid());

-- ── user achievements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jp60_user_achievements (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  session_id  uuid REFERENCES public.jp60_sessions(id) ON DELETE SET NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, code)
);
ALTER TABLE public.jp60_user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_ach_own_select" ON public.jp60_user_achievements;
CREATE POLICY "jp60_ach_own_select" ON public.jp60_user_achievements FOR SELECT USING (user_id = auth.uid());

-- ── friend challenges (SERVICE-ROLE access by code; prevents enumeration) ───
CREATE TABLE IF NOT EXISTS public.jp60_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  creator_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode         text NOT NULL,
  level        text NOT NULL,
  seed         bigint NOT NULL,
  duration_sec int  NOT NULL DEFAULT 60,
  status       text NOT NULL DEFAULT 'open', -- open | complete | expired
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_challenges_code    ON public.jp60_challenges (code);
CREATE INDEX IF NOT EXISTS idx_jp60_challenges_creator ON public.jp60_challenges (creator_id, created_at DESC);
ALTER TABLE public.jp60_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_challenges_creator_select" ON public.jp60_challenges;
CREATE POLICY "jp60_challenges_creator_select" ON public.jp60_challenges FOR SELECT USING (creator_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.jp60_challenge_participants (
  challenge_id uuid NOT NULL REFERENCES public.jp60_challenges(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'opponent', -- creator | opponent
  session_id   uuid REFERENCES public.jp60_sessions(id) ON DELETE SET NULL,
  score        int,
  accuracy     int,
  completed_at timestamptz,
  PRIMARY KEY (challenge_id, user_id)
);
ALTER TABLE public.jp60_challenge_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_cparts_own_select" ON public.jp60_challenge_participants;
CREATE POLICY "jp60_cparts_own_select" ON public.jp60_challenge_participants FOR SELECT USING (user_id = auth.uid());

-- ── bad-question reports (user inserts own; admin reviews via service role) ──
CREATE TABLE IF NOT EXISTS public.jp60_question_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id     uuid REFERENCES public.jp60_sessions(id) ON DELETE SET NULL,
  source_type    text,
  source_id      text,
  q_type         text,
  question_text  text,
  options        jsonb,
  correct_answer text,
  reason         text NOT NULL,
  note           text,
  locale         text,
  status         text NOT NULL DEFAULT 'open', -- open | reviewed | dismissed
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp60_reports_status ON public.jp60_question_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp60_reports_user   ON public.jp60_question_reports (user_id, created_at DESC);
ALTER TABLE public.jp60_question_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp60_reports_own_select" ON public.jp60_question_reports;
DROP POLICY IF EXISTS "jp60_reports_own_insert" ON public.jp60_question_reports;
CREATE POLICY "jp60_reports_own_select" ON public.jp60_question_reports FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "jp60_reports_own_insert" ON public.jp60_question_reports FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── disabled source items (admin removes an item from game generation) ──────
CREATE TABLE IF NOT EXISTS public.jp60_disabled_items (
  source_type text NOT NULL,    -- vocabulary | grammar | kanji
  source_id   text NOT NULL,
  reason      text,
  disabled_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id)
);
ALTER TABLE public.jp60_disabled_items ENABLE ROW LEVEL SECURITY;
-- no policies → service-role only (generation reads via admin client)

-- ── source-table indexes for fast level-filtered sampling (no-op if present) ─
CREATE INDEX IF NOT EXISTS idx_japanese_words_level_pub   ON public.japanese_words   (jlpt_level, is_published);
CREATE INDEX IF NOT EXISTS idx_japanese_grammar_level_pub ON public.japanese_grammar (jlpt_level, is_published);
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_level_pub   ON public.japanese_kanji   (jlpt_level, is_published);
