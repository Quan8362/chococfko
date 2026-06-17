-- ============================================================
-- Migration v2: japanese_comments — trả lời lồng nhau (replies)
-- Chạy SAU migration_japanese_comments.sql trong Supabase SQL Editor.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- 1. Cột parent_id cho bình luận trả lời (NULL = bình luận gốc)
ALTER TABLE public.japanese_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.japanese_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS japanese_comments_parent_idx
  ON public.japanese_comments (parent_id)
  WHERE status = 'approved';

-- 2. Cập nhật view kèm parent_id
-- DROP trước rồi CREATE lại: không thể CREATE OR REPLACE khi chèn cột mới
-- vào giữa (Postgres coi như đổi tên cột cũ).
DROP VIEW IF EXISTS public.japanese_comments_with_author;
CREATE VIEW public.japanese_comments_with_author AS
SELECT
  c.id,
  c.item_type,
  c.item_id,
  c.parent_id,
  c.user_id,
  c.content,
  c.is_anonymous,
  c.status,
  c.created_at,
  CASE WHEN c.is_anonymous THEN NULL ELSE COALESCE(
    NULLIF(TRIM(p.display_name),                     ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'),      ''),
    split_part(u.email, '@', 1)
  ) END AS author_name,
  CASE WHEN c.is_anonymous THEN NULL ELSE COALESCE(
    NULLIF(p.avatar_url,                       ''),
    NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(u.raw_user_meta_data->>'picture',    '')
  ) END AS author_avatar
FROM public.japanese_comments c
LEFT JOIN public.profiles  p ON p.id = c.user_id
LEFT JOIN auth.users       u ON u.id = c.user_id
WHERE c.status = 'approved';

GRANT SELECT ON public.japanese_comments_with_author TO anon, authenticated;

-- 3. Nạp lại schema cache
NOTIFY pgrst, 'reload schema';
