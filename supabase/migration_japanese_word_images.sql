-- ============================================================
-- Japanese word illustration images
-- Adds image caching columns to japanese_words table.
-- Idempotent: safe to run multiple times.
-- ============================================================

ALTER TABLE public.japanese_words
  ADD COLUMN IF NOT EXISTS image_url         text,
  ADD COLUMN IF NOT EXISTS image_alt         text,
  ADD COLUMN IF NOT EXISTS image_source      text,
  ADD COLUMN IF NOT EXISTS image_credit_url  text,
  ADD COLUMN IF NOT EXISTS image_query       text,
  ADD COLUMN IF NOT EXISTS image_fetched_at  timestamptz,
  ADD COLUMN IF NOT EXISTS image_status      text;

-- image_status values:
--   NULL        = never attempted
--   'found'     = image fetched successfully and stored
--   'not_found' = API returned no results
--   'error'     = API call failed
