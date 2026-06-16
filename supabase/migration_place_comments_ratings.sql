-- ============================================================
-- CHỢ CÓC FKO — Bình luận & đánh giá cho Địa điểm (Khám phá)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================

-- ── 1. PLACE COMMENTS (kinh nghiệm / đánh giá bằng chữ) ──────
create table if not exists public.place_comments (
  id          uuid        default gen_random_uuid() primary key,
  place_slug  text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  content     text        not null check (char_length(content) >= 1 and char_length(content) <= 1000),
  status      text        not null default 'approved' check (status in ('approved','hidden')),
  created_at  timestamptz not null default now()
);

create index if not exists place_comments_slug_created
  on public.place_comments (place_slug, created_at);

alter table public.place_comments enable row level security;

drop policy if exists "pc_select" on public.place_comments;
create policy "pc_select" on public.place_comments
  for select using (status = 'approved' or auth.uid() = user_id);

drop policy if exists "pc_insert_own" on public.place_comments;
create policy "pc_insert_own" on public.place_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "pc_delete_own" on public.place_comments;
create policy "pc_delete_own" on public.place_comments
  for delete using (auth.uid() = user_id);

-- View: bình luận kèm tên + avatar tác giả
create or replace view public.place_comments_with_author
  with (security_invoker = true)
as
  select
    c.id,
    c.place_slug,
    c.user_id,
    c.content,
    c.status,
    c.created_at,
    pr.display_name as author_name,
    pr.avatar_url   as author_avatar
  from public.place_comments c
  left join public.profiles pr on pr.id = c.user_id;

-- ── 2. PLACE RATINGS (đánh giá sao 1–5 cho địa điểm) ─────────
create table if not exists public.place_ratings (
  id          uuid        default gen_random_uuid() primary key,
  place_slug  text        not null,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  stars       smallint    not null check (stars between 1 and 5),
  review      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (place_slug, user_id)
);

create index if not exists place_ratings_slug on public.place_ratings (place_slug);

alter table public.place_ratings enable row level security;

drop policy if exists "pr_select" on public.place_ratings;
create policy "pr_select" on public.place_ratings
  for select using (true);

drop policy if exists "pr_insert_own" on public.place_ratings;
create policy "pr_insert_own" on public.place_ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "pr_update_own" on public.place_ratings;
create policy "pr_update_own" on public.place_ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. Reload schema cache ──────────────────────────────────
notify pgrst, 'reload schema';
