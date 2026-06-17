-- ============================================================
-- CHỢ CÓC FKO — Đánh giá (sao 1–5) cho bài viết Cộng đồng
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

create table if not exists public.post_ratings (
  id          uuid        default gen_random_uuid() primary key,
  post_id     uuid        not null references public.posts(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  stars       smallint    not null check (stars between 1 and 5),
  review      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists post_ratings_post on public.post_ratings (post_id);

alter table public.post_ratings enable row level security;

drop policy if exists "post_r_select" on public.post_ratings;
create policy "post_r_select" on public.post_ratings
  for select using (true);

drop policy if exists "post_r_insert_own" on public.post_ratings;
create policy "post_r_insert_own" on public.post_ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "post_r_update_own" on public.post_ratings;
create policy "post_r_update_own" on public.post_ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reload schema cache
notify pgrst, 'reload schema';
