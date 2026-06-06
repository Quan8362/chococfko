-- Migration: Community Chat Polls
-- Run this in Supabase SQL Editor

-- Step 1: Add has_poll column to messages
ALTER TABLE community_chat_messages
  ADD COLUMN IF NOT EXISTS has_poll BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Create polls table
CREATE TABLE IF NOT EXISTS community_chat_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES community_chat_rooms(id) ON DELETE CASCADE,
  message_id UUID REFERENCES community_chat_messages(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (char_length(question) <= 200),
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Step 3: Create poll options table
CREATE TABLE IF NOT EXISTS community_chat_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_chat_polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Create poll votes table
CREATE TABLE IF NOT EXISTS community_chat_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_chat_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES community_chat_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, option_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_polls_room_id ON community_chat_polls(room_id);
CREATE INDEX IF NOT EXISTS idx_polls_message_id ON community_chat_polls(message_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON community_chat_poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON community_chat_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON community_chat_poll_votes(user_id);

-- Enable RLS
ALTER TABLE community_chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_chat_poll_votes ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ──────────────────────────────────────────────────────────────

-- Polls: any authenticated user can SELECT (server actions enforce room membership)
CREATE POLICY "polls_select_authenticated" ON community_chat_polls
  FOR SELECT TO authenticated USING (true);

-- Polls: only own inserts (server validates room membership)
CREATE POLICY "polls_insert_own" ON community_chat_polls
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Poll options: any authenticated user can SELECT
CREATE POLICY "poll_options_select_authenticated" ON community_chat_poll_options
  FOR SELECT TO authenticated USING (true);

-- Poll options: only poll creator can insert (server action validates)
CREATE POLICY "poll_options_insert" ON community_chat_poll_options
  FOR INSERT TO authenticated WITH CHECK (
    poll_id IN (SELECT id FROM community_chat_polls WHERE created_by = auth.uid())
  );

-- Poll votes: any authenticated user can SELECT (for counting)
CREATE POLICY "poll_votes_select_authenticated" ON community_chat_poll_votes
  FOR SELECT TO authenticated USING (true);

-- Poll votes: own inserts only
CREATE POLICY "poll_votes_insert_own" ON community_chat_poll_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Poll votes: own deletes only
CREATE POLICY "poll_votes_delete_own" ON community_chat_poll_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'community_chat_poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_chat_poll_votes;
  END IF;
END $$;
