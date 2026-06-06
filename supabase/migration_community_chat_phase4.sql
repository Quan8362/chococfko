-- ── COMMUNITY CHAT PHASE 4 ────────────────────────────────────────────────────
-- Chạy trong Supabase SQL Editor SAU migration_community_chat_phase3.sql
-- Thêm: is_pinned/pinned_at/pinned_by cho messages + bảng community_chat_reactions

-- ── 1. PINNED COLUMNS ────────────────────────────────────────────────────────

ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by  uuid         REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.community_chat_messages(room_id, is_pinned)
  WHERE is_pinned = true;

-- ── 2. REACTIONS TABLE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_chat_reactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_reaction UNIQUE (message_id, user_id, emoji),
  CONSTRAINT valid_emoji CHECK (emoji IN ('👍', '❤️', '😂', '😮', '🎉'))
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.community_chat_reactions(message_id);

-- ── 3. RLS FOR REACTIONS ─────────────────────────────────────────────────────

ALTER TABLE public.community_chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_authenticated"
  ON public.community_chat_reactions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "reactions_insert_authenticated"
  ON public.community_chat_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions_delete_own"
  ON public.community_chat_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 4. REALTIME ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_reactions;
EXCEPTION WHEN others THEN NULL;
END $$;
