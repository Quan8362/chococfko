-- ============================================================
-- Japanese practice history: sessions + per-answer rows
-- (dynamic DB-driven practice — see app/japanese/practice-actions.ts)
-- Apply manually in the Supabase SQL editor.
-- ============================================================

-- ── japanese_practice_sessions ────────────────────────────
CREATE TABLE IF NOT EXISTS public.japanese_practice_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jlpt_level     text NOT NULL,
  practice_type  text NOT NULL,
  question_count int  NOT NULL,
  correct_count  int  NOT NULL DEFAULT 0,
  wrong_count    int  NOT NULL DEFAULT 0,
  score_percent  int  NOT NULL DEFAULT 0,
  duration_sec   int  NOT NULL DEFAULT 0,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_jp_practice_sessions_user
  ON public.japanese_practice_sessions (user_id, completed_at DESC);

ALTER TABLE public.japanese_practice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_sessions_own_select" ON public.japanese_practice_sessions;
DROP POLICY IF EXISTS "practice_sessions_own_insert" ON public.japanese_practice_sessions;
DROP POLICY IF EXISTS "practice_sessions_own_delete" ON public.japanese_practice_sessions;

CREATE POLICY "practice_sessions_own_select" ON public.japanese_practice_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "practice_sessions_own_insert" ON public.japanese_practice_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "practice_sessions_own_delete" ON public.japanese_practice_sessions
  FOR DELETE USING (user_id = auth.uid());

-- ── japanese_practice_answers ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.japanese_practice_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.japanese_practice_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_type   text NOT NULL,
  source_type     text NOT NULL,   -- vocabulary | grammar | kanji
  source_id       text,
  question_text   text,
  correct_answer  text,
  selected_answer text,
  is_correct      boolean NOT NULL DEFAULT false,
  answered_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jp_practice_answers_session
  ON public.japanese_practice_answers (session_id);
CREATE INDEX IF NOT EXISTS idx_jp_practice_answers_user
  ON public.japanese_practice_answers (user_id, answered_at DESC);

ALTER TABLE public.japanese_practice_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_answers_own_select" ON public.japanese_practice_answers;
DROP POLICY IF EXISTS "practice_answers_own_insert" ON public.japanese_practice_answers;
DROP POLICY IF EXISTS "practice_answers_own_delete" ON public.japanese_practice_answers;

CREATE POLICY "practice_answers_own_select" ON public.japanese_practice_answers
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "practice_answers_own_insert" ON public.japanese_practice_answers
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "practice_answers_own_delete" ON public.japanese_practice_answers
  FOR DELETE USING (user_id = auth.uid());

-- ── Source-table indexes for fast level-filtered random sampling ──
-- (no-ops if the dictionary/grammar/kanji migrations already created them)
CREATE INDEX IF NOT EXISTS idx_japanese_words_level_pub
  ON public.japanese_words (jlpt_level, is_published);
CREATE INDEX IF NOT EXISTS idx_japanese_grammar_level_pub
  ON public.japanese_grammar (jlpt_level, is_published);
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_level_pub
  ON public.japanese_kanji (jlpt_level, is_published);
