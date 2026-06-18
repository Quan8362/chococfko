-- ============================================================
-- Japanese word illustration — manual override / review metadata
-- Optional companion to migration_japanese_word_images.sql.
-- Lets admins curate and approve/reject the illustration per word.
--
-- The runtime already supports the relevant states through the existing
-- `image_status` column using two extra values:
--   'approved' -> always serve the stored image_url, never re-fetch
--   'rejected' -> never serve an image, show the "no suitable image" placeholder
-- This migration adds an explicit, queryable review column for an admin UI.
-- Idempotent: safe to run multiple times.
-- ============================================================

ALTER TABLE public.japanese_words
  ADD COLUMN IF NOT EXISTS image_relevance_status text DEFAULT 'auto',  -- approved | pending | rejected | auto
  ADD COLUMN IF NOT EXISTS image_updated_at       timestamptz;

-- Backfill image_updated_at from the existing fetch timestamp.
UPDATE public.japanese_words
   SET image_updated_at = image_fetched_at
 WHERE image_updated_at IS NULL AND image_fetched_at IS NOT NULL;
