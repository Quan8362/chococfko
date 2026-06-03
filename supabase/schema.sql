-- ============================================================
-- CHỢ CÓC FKO — Supabase Schema (Giai đoạn 2)
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select using (true);

create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- Tự động tạo profile khi có user mới đăng ký
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. POSTS ────────────────────────────────────────────────
create table if not exists public.posts (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users on delete cascade not null,
  title          text not null,
  category       text not null,
  category_label text not null,
  area           text not null,
  rating         int  not null default 5 check (rating between 1 and 5),
  excerpt        text,
  body           text[],
  img            text,
  img_fallback   text,
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected')),
  created_at     timestamptz default now()
);

alter table public.posts enable row level security;

-- Mọi người xem được bài đã duyệt
create policy "posts_select_approved" on public.posts
  for select using (status = 'approved');

-- Đã đăng nhập mới được gửi bài
create policy "posts_insert" on public.posts
  for insert with check (auth.uid() = user_id);

-- Không ai được xóa (kể cả chủ bài) — chỉ admin qua Service Role key
create policy "posts_no_delete" on public.posts
  for delete using (false);


-- ── 3. INDEX ────────────────────────────────────────────────
create index if not exists posts_status_created
  on public.posts (status, created_at desc);


-- ── 4. VIEW: posts kèm tên tác giả ──────────────────────────
create or replace view public.posts_with_author as
  select
    p.*,
    pr.display_name as author_name,
    pr.avatar_url   as author_avatar
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id;


-- ── XONG ────────────────────────────────────────────────────
-- Sau khi chạy xong, vào Supabase → Authentication → Providers
-- Bật "Email" (mặc định đã bật).
-- Để test nhanh (không cần xác nhận email):
--   Authentication → Settings → bỏ tick "Enable email confirmations"
