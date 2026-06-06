-- =====================================================================
-- Phase 10: Message Edit
-- Run in Supabase SQL Editor
-- =====================================================================

-- Add edited_at timestamp to messages
ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Allow users to update their own non-deleted messages
-- Time limit is enforced in server action (10 minutes)
DROP POLICY IF EXISTS "community_chat_update_own" ON public.community_chat_messages;
CREATE POLICY "community_chat_update_own"
  ON public.community_chat_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_deleted = false)
  WITH CHECK (user_id = auth.uid());
