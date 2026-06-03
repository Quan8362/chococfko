-- ============================================================
-- MIGRATION: Add post_type column to posts table
-- Phân biệt bài Khám phá (place) và bài Cộng đồng (community)
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột post_type với default là 'community' (backward compat)
alter table public.posts
  add column if not exists post_type text not null default 'community'
  check (post_type in ('place', 'community'));

-- 2. Đặt tất cả bài cũ (chưa có post_type) thành 'community'
update public.posts
  set post_type = 'community'
  where post_type is null;

-- 3. Tạo index để query theo post_type nhanh hơn
create index if not exists posts_post_type_idx
  on public.posts (post_type, status, created_at desc);

-- 4. Cập nhật view posts_with_author để bao gồm post_type
-- Phải DROP rồi CREATE lại vì không thể thêm cột vào view có sẵn
drop view if exists public.posts_with_author;
create view public.posts_with_author as
  select
    p.id,
    p.user_id,
    p.title,
    p.category,
    p.category_label,
    p.area,
    p.rating,
    p.excerpt,
    p.body,
    p.img,
    p.img_fallback,
    p.post_type,
    p.status,
    p.created_at,
    pr.display_name as author_name,
    pr.avatar_url   as author_avatar
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id;
