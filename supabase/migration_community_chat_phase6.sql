-- Phase 6: Reply to message (quote + reply_to_id)
-- Run this in Supabase SQL Editor

ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.community_chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_message text,
  ADD COLUMN IF NOT EXISTS reply_to_display_name text;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id
  ON public.community_chat_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;
