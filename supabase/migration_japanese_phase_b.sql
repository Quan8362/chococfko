-- ============================================================
-- Phase B: Japanese module — source tracking + vi search
-- Safe to run multiple times: IF NOT EXISTS / IF NOT EXISTS
-- Does NOT: drop columns, change RLS, import data
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. japanese_words
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.japanese_words
  ADD COLUMN IF NOT EXISTS source            text    DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS source_id         text,
  ADD COLUMN IF NOT EXISTS license           text    DEFAULT 'self-authored',
  ADD COLUMN IF NOT EXISTS attribution       text,
  ADD COLUMN IF NOT EXISTS has_vi_meaning    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vi_search_text    text,
  ADD COLUMN IF NOT EXISTS kana_normalized   text,
  ADD COLUMN IF NOT EXISTS romaji_normalized text;

-- Backfill existing rows
UPDATE public.japanese_words
SET
  has_vi_meaning = (
    meanings IS NOT NULL
    AND jsonb_array_length(meanings) > 0
    AND meanings -> 0 ->> 'vi' IS NOT NULL
    AND meanings -> 0 ->> 'vi' != ''
  ),
  vi_search_text = NULLIF(TRIM(
    COALESCE(
      (SELECT string_agg(m ->> 'vi', ' ')
       FROM jsonb_array_elements(COALESCE(meanings, '[]'::jsonb)) AS m
       WHERE m ->> 'vi' IS NOT NULL AND m ->> 'vi' != ''),
      ''
    ) || ' ' ||
    COALESCE(
      (SELECT string_agg(e ->> 'vi', ' ')
       FROM jsonb_array_elements(COALESCE(examples, '[]'::jsonb)) AS e
       WHERE e ->> 'vi' IS NOT NULL AND e ->> 'vi' != ''),
      ''
    )
  ), ''),
  kana_normalized   = COALESCE(reading, ''),
  romaji_normalized = LOWER(COALESCE(romaji, ''));

-- Btree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_japanese_words_source
  ON public.japanese_words (source);
CREATE INDEX IF NOT EXISTS idx_japanese_words_source_id
  ON public.japanese_words (source_id);
CREATE INDEX IF NOT EXISTS idx_japanese_words_has_vi_meaning
  ON public.japanese_words (has_vi_meaning);

-- Trigram indexes for partial-text search
-- (pg_trgm already enabled in migration_japanese_dictionary.sql)
CREATE INDEX IF NOT EXISTS idx_japanese_words_vi_search_trgm
  ON public.japanese_words USING gin (vi_search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_japanese_words_word_trgm
  ON public.japanese_words USING gin (word gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_japanese_words_reading_trgm
  ON public.japanese_words USING gin (reading gin_trgm_ops);


-- ──────────────────────────────────────────────────────────────
-- 2. japanese_kanji
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.japanese_kanji
  ADD COLUMN IF NOT EXISTS source         text    DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS source_id      text,
  ADD COLUMN IF NOT EXISTS license        text    DEFAULT 'self-authored',
  ADD COLUMN IF NOT EXISTS attribution    text,
  ADD COLUMN IF NOT EXISTS has_vi_meaning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vi_search_text text;

-- Backfill existing rows
UPDATE public.japanese_kanji
SET
  has_vi_meaning = (
    meanings IS NOT NULL
    AND jsonb_array_length(meanings) > 0
    AND meanings -> 0 ->> 'vi' IS NOT NULL
    AND meanings -> 0 ->> 'vi' != ''
  ),
  vi_search_text = NULLIF(TRIM(
    COALESCE(
      (SELECT string_agg(m ->> 'vi', ' ')
       FROM jsonb_array_elements(COALESCE(meanings, '[]'::jsonb)) AS m
       WHERE m ->> 'vi' IS NOT NULL AND m ->> 'vi' != ''),
      ''
    )
  ), '');

-- Btree indexes
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_source
  ON public.japanese_kanji (source);
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_source_id
  ON public.japanese_kanji (source_id);
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_has_vi_meaning
  ON public.japanese_kanji (has_vi_meaning);

-- Trigram index for vi search
CREATE INDEX IF NOT EXISTS idx_japanese_kanji_vi_search_trgm
  ON public.japanese_kanji USING gin (vi_search_text gin_trgm_ops);


-- ──────────────────────────────────────────────────────────────
-- 3. japanese_grammar
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.japanese_grammar
  ADD COLUMN IF NOT EXISTS source      text DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS source_id   text,
  ADD COLUMN IF NOT EXISTS license     text DEFAULT 'self-authored',
  ADD COLUMN IF NOT EXISTS attribution text;

-- Btree indexes
CREATE INDEX IF NOT EXISTS idx_japanese_grammar_source
  ON public.japanese_grammar (source);
CREATE INDEX IF NOT EXISTS idx_japanese_grammar_source_id
  ON public.japanese_grammar (source_id);


-- ──────────────────────────────────────────────────────────────
-- 4. jp_quiz_questions
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.jp_quiz_questions
  ADD COLUMN IF NOT EXISTS source      text DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS source_id   text,
  ADD COLUMN IF NOT EXISTS license     text DEFAULT 'self-authored',
  ADD COLUMN IF NOT EXISTS attribution text;

-- Btree indexes
CREATE INDEX IF NOT EXISTS idx_jp_quiz_questions_source
  ON public.jp_quiz_questions (source);
CREATE INDEX IF NOT EXISTS idx_jp_quiz_questions_source_id
  ON public.jp_quiz_questions (source_id);
