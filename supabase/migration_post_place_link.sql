-- ============================================================
-- CHỢ CÓC FKO — Liên kết bài viết cộng đồng với địa điểm
-- Add a stable place reference to community posts so a place
-- detail page can show the member posts written about it.
--
-- Non-destructive: adds one nullable column + index. No data is
-- modified or removed. Run in the Supabase SQL Editor.
--
-- Convention note: the other place_* tables (place_comments,
-- place_ratings, place_translations) key on places.slug, so we
-- key posts the same way for consistency. places.slug is UNIQUE
-- and is the canonical public URL key.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS place_slug text;

-- Fast lookup of approved posts for a given place.
CREATE INDEX IF NOT EXISTS posts_place_slug_status
  ON public.posts (place_slug, status, created_at DESC)
  WHERE place_slug IS NOT NULL;

COMMENT ON COLUMN public.posts.place_slug IS
  'Slug of the place this community post is about (references places.slug). NULL = general post.';

-- RLS unchanged: existing "posts_select_approved" (status = ''approved'')
-- already governs visibility; the new column is just extra data on the row.
