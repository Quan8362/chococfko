-- ── COMMUNITY CHAT PHASE 11: Room Avatars ──────────────────────────────────
-- Chạy trong Supabase SQL Editor
-- Thêm: avatar_url cho community_chat_rooms + Storage bucket

-- 1. Thêm cột avatar_url vào bảng rooms
ALTER TABLE public.community_chat_rooms
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Tạo Storage bucket cho room avatars (public, không cần signed URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-chat-room-avatars',
  'community-chat-room-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies
DROP POLICY IF EXISTS "room_avatars_public_read" ON storage.objects;
CREATE POLICY "room_avatars_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-chat-room-avatars');

DROP POLICY IF EXISTS "room_avatars_upload" ON storage.objects;
CREATE POLICY "room_avatars_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-chat-room-avatars');

DROP POLICY IF EXISTS "room_avatars_update" ON storage.objects;
CREATE POLICY "room_avatars_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'community-chat-room-avatars');

DROP POLICY IF EXISTS "room_avatars_delete" ON storage.objects;
CREATE POLICY "room_avatars_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-chat-room-avatars');
