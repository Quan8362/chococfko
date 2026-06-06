-- Phase 7: Image sharing in Group Chat
-- Run this in Supabase SQL Editor

-- 1. Add has_attachment flag to messages
ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS has_attachment boolean NOT NULL DEFAULT false;

-- 2. Create community_chat_attachments table
CREATE TABLE IF NOT EXISTS public.community_chat_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id        uuid REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'community-chat-images',
  storage_path   text NOT NULL,
  file_name      text,
  mime_type      text NOT NULL,
  file_size      integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_att_file_size_check  CHECK (file_size > 0 AND file_size <= 3145728),
  CONSTRAINT chat_att_mime_check       CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT chat_att_unique_path      UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_chat_att_message_id   ON public.community_chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_att_user_id      ON public.community_chat_attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_att_room_id      ON public.community_chat_attachments(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_att_created_at   ON public.community_chat_attachments(created_at DESC);

-- 3. RLS for community_chat_attachments
ALTER TABLE public.community_chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can view chat attachments"
  ON public.community_chat_attachments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated can insert own chat attachments"
  ON public.community_chat_attachments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. Supabase Storage bucket (run in SQL Editor)
-- Creates private bucket community-chat-images with 3MB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-chat-images',
  'community-chat-images',
  false,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS policies
CREATE POLICY "authenticated can view chat images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community-chat-images');

CREATE POLICY "authenticated can upload own chat images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Enable Realtime for community_chat_attachments (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'community_chat_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_attachments;
  END IF;
END $$;
