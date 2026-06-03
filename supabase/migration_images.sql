-- ============================================================
-- CHỢ CÓC FKO — Storage bucket cho ảnh bài viết
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- Tạo bucket (nếu chưa có)
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Cho phép user đã đăng nhập upload ảnh
create policy "auth_upload_post_images"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and auth.uid() is not null);

-- Cho phép mọi người xem ảnh (bucket public)
create policy "public_read_post_images"
  on storage.objects for select
  using (bucket_id = 'post-images');

-- Cho phép người upload xóa ảnh của mình
create policy "owner_delete_post_images"
  on storage.objects for delete
  using (bucket_id = 'post-images' and auth.uid() is not null);
