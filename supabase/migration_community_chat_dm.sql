-- ── COMMUNITY CHAT: Direct Messages ─────────────────────────────────────────
-- Phase DM: Nhắn tin riêng 1-1 giữa các user
-- Run this migration in Supabase SQL Editor

-- 1. DM Conversations (user1_id < user2_id enforces a canonical ordering → unique pair)
CREATE TABLE IF NOT EXISTS public.community_dm_conversations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,
  CONSTRAINT dm_different_users CHECK (user1_id != user2_id),
  CONSTRAINT dm_users_ordered   CHECK (user1_id < user2_id),
  CONSTRAINT dm_unique_pair     UNIQUE (user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_user1     ON public.community_dm_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conv_user2     ON public.community_dm_conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_dm_conv_last_msg  ON public.community_dm_conversations(last_message_at DESC NULLS LAST);

-- 2. DM Messages
CREATE TABLE IF NOT EXISTS public.community_dm_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.community_dm_conversations(id) ON DELETE CASCADE,
  sender_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name    TEXT        NOT NULL,
  avatar_url      TEXT,
  message         TEXT        NOT NULL,
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  CONSTRAINT dm_message_length CHECK (char_length(trim(message)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_dm_msg_conv_created ON public.community_dm_messages(conversation_id, created_at ASC);

-- 3. RLS: conversations
ALTER TABLE public.community_dm_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_conv_select" ON public.community_dm_conversations;
CREATE POLICY "dm_conv_select"
  ON public.community_dm_conversations FOR SELECT TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

DROP POLICY IF EXISTS "dm_conv_insert" ON public.community_dm_conversations;
CREATE POLICY "dm_conv_insert"
  ON public.community_dm_conversations FOR INSERT TO authenticated
  WITH CHECK (
    (user1_id = auth.uid() OR user2_id = auth.uid())
    AND user1_id != user2_id
    AND user1_id < user2_id
  );

DROP POLICY IF EXISTS "dm_conv_update" ON public.community_dm_conversations;
CREATE POLICY "dm_conv_update"
  ON public.community_dm_conversations FOR UPDATE TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid())
  WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

-- 4. RLS: messages
ALTER TABLE public.community_dm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_msg_select" ON public.community_dm_messages;
CREATE POLICY "dm_msg_select"
  ON public.community_dm_messages FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM public.community_dm_conversations c
      WHERE c.id = conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "dm_msg_insert" ON public.community_dm_messages;
CREATE POLICY "dm_msg_insert"
  ON public.community_dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_dm_conversations c
      WHERE c.id = conversation_id
        AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- 5. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_dm_conversations;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_dm_messages;
EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
