-- ============================================================
-- Phase 2: jp_flashcard_progress table
-- Tracks per-user learning progress for japanese_words
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jp_flashcard_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id     uuid NOT NULL REFERENCES public.japanese_words(id) ON DELETE CASCADE,
  box         int DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  status      text DEFAULT 'learning' CHECK (status IN ('learning', 'review', 'mastered')),
  next_review timestamptz,
  last_result text CHECK (last_result IN ('correct', 'wrong')),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT jp_flashcard_progress_user_word_unique UNIQUE (user_id, word_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jp_progress_user_id   ON public.jp_flashcard_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_jp_progress_word_id   ON public.jp_flashcard_progress (word_id);
CREATE INDEX IF NOT EXISTS idx_jp_progress_status    ON public.jp_flashcard_progress (user_id, status);
CREATE INDEX IF NOT EXISTS idx_jp_progress_review    ON public.jp_flashcard_progress (user_id, next_review);

-- RLS — users can only access their own rows
ALTER TABLE public.jp_flashcard_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own progress" ON public.jp_flashcard_progress;
CREATE POLICY "Users manage own progress"
  ON public.jp_flashcard_progress
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
