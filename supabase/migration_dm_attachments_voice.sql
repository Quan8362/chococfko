-- ============================================================
-- CHỢ CÓC FKO — Ảnh / File / Tin nhắn thoại cho DM (+ thoại nhóm)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

-- ── 1. Cột đính kèm cho DM ──────────────────────────────────
alter table public.community_dm_messages
  add column if not exists kind              text not null default 'text'
    check (kind in ('text','image','file','audio')),
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path   text,
  add column if not exists attachment_mime   text,
  add column if not exists attachment_name   text,
  add column if not exists attachment_size   integer,
  add column if not exists audio_duration    integer;   -- giây (cho 'audio')

-- ── 2. Cột thời lượng cho thoại nhóm ────────────────────────
alter table public.community_chat_attachments
  add column if not exists duration_seconds integer;

-- ── 3. Bucket riêng cho audio (private) ─────────────────────
insert into storage.buckets (id, name, public)
values ('community-chat-audio', 'community-chat-audio', false)
on conflict (id) do nothing;

drop policy if exists "cca_owner_insert" on storage.objects;
create policy "cca_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'community-chat-audio'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cca_owner_read" on storage.objects;
create policy "cca_owner_read"
  on storage.objects for select
  using (bucket_id = 'community-chat-audio' and auth.uid() is not null);

drop policy if exists "cca_owner_delete" on storage.objects;
create policy "cca_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-chat-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
