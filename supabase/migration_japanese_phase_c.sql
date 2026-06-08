-- ============================================================
-- Phase C: UNIQUE constraint on japanese_words(word, reading)
-- Required for UPSERT dedup in import tool.
-- NULLS NOT DISTINCT: two rows with same word + NULL reading
-- are treated as one conflict (PostgreSQL 15+, Supabase default).
-- Idempotent: DROP + ADD, dedup step is a no-op if no duplicates.
-- ============================================================

-- Step 1: Remove duplicate (word, reading) rows if any exist
-- Keeps the row with highest frequency, then oldest created_at
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY word, COALESCE(reading, '')
      ORDER BY frequency DESC NULLS LAST, created_at ASC
    ) AS rn
  FROM public.japanese_words
)
DELETE FROM public.japanese_words
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: Add unique constraint (DROP first for idempotency)
ALTER TABLE public.japanese_words
  DROP CONSTRAINT IF EXISTS japanese_words_word_reading_unique;

ALTER TABLE public.japanese_words
  ADD CONSTRAINT japanese_words_word_reading_unique
  UNIQUE NULLS NOT DISTINCT (word, reading);
