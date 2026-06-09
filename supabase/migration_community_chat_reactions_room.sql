-- Fix: Reactions Realtime không hoạt động
-- Root cause: subscription không có filter → Supabase không deliver events đúng cách
-- Fix: thêm room_id vào reactions, dùng filtered subscription như messages

-- 1. Thêm cột room_id (nullable để không break existing rows)
ALTER TABLE public.community_chat_reactions
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE;

-- 2. Backfill room_id từ messages
UPDATE public.community_chat_reactions r
SET room_id = m.room_id
FROM public.community_chat_messages m
WHERE r.message_id = m.id
  AND r.room_id IS NULL;

-- 3. Index cho subscription filter
CREATE INDEX IF NOT EXISTS idx_chat_reactions_room
  ON public.community_chat_reactions(room_id);

-- 4. REPLICA IDENTITY FULL để DELETE events có đủ columns trong payload.old
ALTER TABLE public.community_chat_reactions REPLICA IDENTITY FULL;
