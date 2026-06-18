-- ============================================================
-- Japanese word relations (typed, curated)
-- Stores semantically meaningful relationships between dictionary
-- words so the detail page can show real synonyms / antonyms /
-- near-synonyms / commonly-confused / same-kanji words instead of
-- random same-JLPT-level padding.
-- Idempotent: safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.japanese_word_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_word_id  uuid NOT NULL REFERENCES public.japanese_words(id) ON DELETE CASCADE,
  target_word_id  uuid NOT NULL REFERENCES public.japanese_words(id) ON DELETE CASCADE,
  relation_type   text NOT NULL CHECK (relation_type IN
                    ('synonym','antonym','near_synonym','confusing','same_kanji','related')),
  confidence      real NOT NULL DEFAULT 1.0,           -- 0..1; only >= 0.5 is shown
  source          text DEFAULT 'curated',              -- 'curated' | 'ai' | 'import'
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  -- No self-relations, and no duplicate (source,target,type) rows.
  CONSTRAINT japanese_word_relations_no_self CHECK (source_word_id <> target_word_id),
  CONSTRAINT japanese_word_relations_unique UNIQUE (source_word_id, target_word_id, relation_type)
);

-- Lookups are by either side of the pair (the helper queries both directions).
CREATE INDEX IF NOT EXISTS idx_jp_word_relations_source ON public.japanese_word_relations (source_word_id);
CREATE INDEX IF NOT EXISTS idx_jp_word_relations_target ON public.japanese_word_relations (target_word_id);

-- RLS — relations are public read-only (only high-confidence ones surface in UI).
ALTER TABLE public.japanese_word_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read word relations" ON public.japanese_word_relations;
CREATE POLICY "Public read word relations"
  ON public.japanese_word_relations FOR SELECT
  USING (true);
