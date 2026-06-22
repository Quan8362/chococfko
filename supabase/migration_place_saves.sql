-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 4
-- Saved places (lưu địa điểm) cho người dùng đăng nhập.
--
-- Khách (chưa đăng nhập) lưu tạm ở localStorage; sau khi đăng nhập, client
-- merge (dedup) vào bảng này. RLS: mỗi người chỉ thấy/sửa bản ghi CỦA MÌNH.
--
-- AN TOÀN: chỉ TẠO bảng (idempotent). Không đụng dữ liệu khác.
-- ROLLBACK: drop table if exists public.place_saves;
-- ============================================================

create table if not exists public.place_saves (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  place_slug text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_slug)   -- chống lưu trùng cùng 1 địa điểm
);

create index if not exists place_saves_user_created_idx
  on public.place_saves (user_id, created_at desc);

alter table public.place_saves enable row level security;

-- Chỉ chủ sở hữu mới ĐỌC được (không ai thấy saves của người khác).
drop policy if exists "place_saves_select_own" on public.place_saves;
create policy "place_saves_select_own"
  on public.place_saves for select
  using (auth.uid() = user_id);

drop policy if exists "place_saves_insert_own" on public.place_saves;
create policy "place_saves_insert_own"
  on public.place_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "place_saves_delete_own" on public.place_saves;
create policy "place_saves_delete_own"
  on public.place_saves for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
