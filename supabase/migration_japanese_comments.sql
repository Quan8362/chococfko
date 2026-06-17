-- ============================================================
-- Migration: japanese_comments — bình luận cho từ vựng & ngữ pháp
-- (giống Mazii: mỗi từ/mẫu ngữ pháp có phần góp ý ở trang chi tiết)
-- Chạy trong Supabase Dashboard → SQL Editor
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- 1. Bảng bình luận (polymorphic: word | grammar)
CREATE TABLE IF NOT EXISTS public.japanese_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type    TEXT        NOT NULL CHECK (item_type IN ('word', 'grammar')),
  item_id      UUID        NOT NULL,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
  is_anonymous BOOLEAN     NOT NULL DEFAULT false,
  status       TEXT        NOT NULL DEFAULT 'approved'
                           CHECK (status IN ('approved', 'deleted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- 2. Index tra nhanh theo từng item
CREATE INDEX IF NOT EXISTS japanese_comments_item_idx
  ON public.japanese_comments (item_type, item_id, created_at ASC)
  WHERE status = 'approved';

-- 3. View kèm thông tin tác giả (fallback qua auth.users cho user OAuth
--    chưa đặt display_name trong profiles). Ẩn tên/avatar nếu bình luận ẩn danh.
--    View dùng quyền owner (security definer) để đọc auth.users; đã lọc sẵn
--    status = 'approved' nên chỉ lộ bình luận hợp lệ.
CREATE OR REPLACE VIEW public.japanese_comments_with_author AS
SELECT
  c.id,
  c.item_type,
  c.item_id,
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

-- 4. RLS
ALTER TABLE public.japanese_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: ai cũng đọc được bình luận đã duyệt
DROP POLICY IF EXISTS "Anyone can view approved jp comments" ON public.japanese_comments;
CREATE POLICY "Anyone can view approved jp comments"
  ON public.japanese_comments FOR SELECT TO anon, authenticated
  USING (status = 'approved');

-- INSERT: user đã đăng nhập, chỉ tạo bình luận của chính mình
DROP POLICY IF EXISTS "Authenticated users can insert jp comments" ON public.japanese_comments;
CREATE POLICY "Authenticated users can insert jp comments"
  ON public.japanese_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'approved');

-- (Xóa = soft-delete) được xử lý phía server bằng service role sau khi kiểm tra
-- quyền sở hữu/admin, nên không cần policy UPDATE/DELETE cho user thường.

-- 5. Nạp lại schema cache
NOTIFY pgrst, 'reload schema';
