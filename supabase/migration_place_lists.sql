-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 5 (part 1/2)
-- Custom lists (danh sách địa điểm tự tạo) + chia sẻ read-only.
--
-- Riêng tư mặc định. Chỉ chủ sở hữu CRUD (RLS auth.uid()=user_id). Chia sẻ
-- read-only qua share_token KHÔNG đoán được (server action dùng service role,
-- lọc is_shareable=true + token) — KHÔNG lộ list riêng tư qua ID tuần tự.
--
-- AN TOÀN: chỉ TẠO (idempotent). ROLLBACK: drop table place_list_items, place_lists;
-- ============================================================

create table if not exists public.place_lists (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  title         text        not null check (char_length(title) between 1 and 120),
  description   text,
  is_shareable  boolean     not null default false,
  share_notes   boolean     not null default false,  -- include item notes in shared view?
  share_token   text        unique,                  -- unguessable; null until shared
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.place_list_items (
  id          uuid        primary key default gen_random_uuid(),
  list_id     uuid        not null references public.place_lists(id) on delete cascade,
  place_slug  text        not null,
  sort_order  int         not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  unique (list_id, place_slug)            -- không thêm trùng địa điểm vào 1 list
);

create index if not exists place_lists_user_idx        on public.place_lists (user_id, updated_at desc);
create index if not exists place_lists_share_token_idx on public.place_lists (share_token);
create index if not exists place_list_items_list_idx   on public.place_list_items (list_id, sort_order);

-- updated_at auto-touch (reuse set_updated_at from migration_places.sql)
drop trigger if exists place_lists_set_updated_at on public.place_lists;
create trigger place_lists_set_updated_at
  before update on public.place_lists
  for each row execute procedure public.set_updated_at();

alter table public.place_lists      enable row level security;
alter table public.place_list_items enable row level security;

-- place_lists: owner-only.
drop policy if exists "place_lists_select_own" on public.place_lists;
create policy "place_lists_select_own" on public.place_lists for select using (auth.uid() = user_id);
drop policy if exists "place_lists_insert_own" on public.place_lists;
create policy "place_lists_insert_own" on public.place_lists for insert with check (auth.uid() = user_id);
drop policy if exists "place_lists_update_own" on public.place_lists;
create policy "place_lists_update_own" on public.place_lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "place_lists_delete_own" on public.place_lists;
create policy "place_lists_delete_own" on public.place_lists for delete using (auth.uid() = user_id);

-- place_list_items: access gated by parent list ownership.
drop policy if exists "place_list_items_select_own" on public.place_list_items;
create policy "place_list_items_select_own" on public.place_list_items for select
  using (exists (select 1 from public.place_lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "place_list_items_insert_own" on public.place_list_items;
create policy "place_list_items_insert_own" on public.place_list_items for insert
  with check (exists (select 1 from public.place_lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "place_list_items_update_own" on public.place_list_items;
create policy "place_list_items_update_own" on public.place_list_items for update
  using (exists (select 1 from public.place_lists l where l.id = list_id and l.user_id = auth.uid()));
drop policy if exists "place_list_items_delete_own" on public.place_list_items;
create policy "place_list_items_delete_own" on public.place_list_items for delete
  using (exists (select 1 from public.place_lists l where l.id = list_id and l.user_id = auth.uid()));

notify pgrst, 'reload schema';
