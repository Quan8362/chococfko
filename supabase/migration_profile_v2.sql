-- ============================================================
-- CHỢ CÓC FKO — Profile v2: thêm trường mới + bucket avatars
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- ── 1. Thêm cột mới vào bảng profiles ───────────────────────
alter table public.profiles
  add column if not exists bio           text,
  add column if not exists area          text,
  add column if not exists facebook_url  text,
  add column if not exists instagram_url text,
  add column if not exists updated_at    timestamptz default now();

-- ── 2. Tạo bucket avatars ────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ── 3. RLS policies cho bucket avatars ──────────────────────

-- Mọi người đều xem được avatar (bucket public)
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- User chỉ upload vào folder của chính mình: avatars/{user_id}/...
create policy "avatars_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- User chỉ update file trong folder của mình
create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- User chỉ xóa file trong folder của mình
create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
