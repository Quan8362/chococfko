-- Phase 12: File Attachments in Group Chat
-- Chạy trong Supabase SQL Editor

-- 1. Nới lỏng constraints trên community_chat_attachments để cho phép file (không chỉ ảnh)
ALTER TABLE public.community_chat_attachments
  DROP CONSTRAINT IF EXISTS chat_att_file_size_check;

ALTER TABLE public.community_chat_attachments
  DROP CONSTRAINT IF EXISTS chat_att_mime_check;

ALTER TABLE public.community_chat_attachments
  ADD CONSTRAINT chat_att_file_size_check
    CHECK (file_size > 0 AND file_size <= 10485760);  -- 10MB

ALTER TABLE public.community_chat_attachments
  ADD CONSTRAINT chat_att_mime_check
    CHECK (mime_type IN (
      -- Images
      'image/jpeg', 'image/png', 'image/webp',
      -- Files
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/zip'
    ));

-- 2. Tạo Storage bucket cho file đính kèm (private, 10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-chat-files',
  'community-chat-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies cho community-chat-files
CREATE POLICY "authenticated can view chat files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community-chat-files');

CREATE POLICY "authenticated can upload own chat files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-chat-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
