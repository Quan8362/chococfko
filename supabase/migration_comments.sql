-- ============================================================
-- Migration: comments table for community post detail pages
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     TEXT        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
  status      TEXT        NOT NULL DEFAULT 'approved'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Index for fast lookup per post
CREATE INDEX IF NOT EXISTS comments_post_id_idx
  ON public.comments (post_id, created_at ASC)
  WHERE status = 'approved';

-- 3. View joining with profiles for author info
CREATE OR REPLACE VIEW public.comments_with_author
  WITH (security_invoker = true)
AS
  SELECT
    c.id,
    c.post_id,
    c.user_id,
    c.content,
    c.status,
    c.created_at,
    c.updated_at,
    p.display_name AS author_name,
    p.avatar_url   AS author_avatar
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id;

-- 4. Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 5. SELECT: anyone can read approved comments
DROP POLICY IF EXISTS "Anyone can view approved comments" ON public.comments;
CREATE POLICY "Anyone can view approved comments"
  ON public.comments FOR SELECT TO anon, authenticated
  USING (status = 'approved');

-- 6. INSERT: logged-in users can add comments (always approved by default)
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;
CREATE POLICY "Authenticated users can insert comments"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'approved');

-- 7. DELETE: user can delete own comments
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 8. Reload schema cache
NOTIFY pgrst, 'reload schema';
