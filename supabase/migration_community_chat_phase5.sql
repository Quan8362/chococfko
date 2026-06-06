-- ── COMMUNITY CHAT PHASE 5 ────────────────────────────────────────────────────
-- Chạy trong Supabase SQL Editor SAU migration_community_chat_phase4.sql
-- Thêm: mentioned_user_ids + mentioned_names vào messages + bảng community_chat_mentions

-- ── 1. MENTION COLUMNS ON MESSAGES ────────────────────────────────────────────

ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentioned_names     text[]  NOT NULL DEFAULT '{}';

-- ── 2. MENTIONS TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_chat_mentions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid        NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id           uuid        REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  is_read           boolean     NOT NULL DEFAULT false,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_mention UNIQUE (message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_user_unread
  ON public.community_chat_mentions(mentioned_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_message
  ON public.community_chat_mentions(message_id);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_room
  ON public.community_chat_mentions(room_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.community_chat_mentions ENABLE ROW LEVEL SECURITY;

-- User chỉ xem mention của chính mình
CREATE POLICY "mentions_select_own"
  ON public.community_chat_mentions
  FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid());

-- User đăng nhập có thể tạo mention khi gửi tin
CREATE POLICY "mentions_insert_authenticated"
  ON public.community_chat_mentions
  FOR INSERT TO authenticated
  WITH CHECK (mentioned_by = auth.uid());

-- User chỉ đánh dấu đã đọc cho mention của chính mình
CREATE POLICY "mentions_update_own"
  ON public.community_chat_mentions
  FOR UPDATE TO authenticated
  USING (mentioned_user_id = auth.uid())
  WITH CHECK (mentioned_user_id = auth.uid());

-- ── 4. REALTIME ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_mentions;
EXCEPTION WHEN others THEN NULL;
END $$;
