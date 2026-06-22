-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 7 (part 2/3)
-- Curated collections (bộ sưu tập) — Admin-curated, public read.
--
-- Mỗi collection là 1 BỘ LỌC CÓ CẤU TRÚC (filters jsonb) chạy qua engine tìm
-- kiếm sẵn có → KHÔNG có khẳng định biên tập mà dữ liệu không chứng minh được.
-- Built-in defaults nằm trong code (lib/collections.ts); bảng này cho Admin
-- thêm/ghi đè theo slug. Public CHỈ đọc bản is_published=true.
--
-- AN TOÀN: chỉ THÊM (idempotent). ROLLBACK ở cuối file.
-- ============================================================

create table if not exists public.place_collections (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  title        text,
  description  text,
  emoji        text,
  filters      jsonb       not null default '{}'::jsonb,
  sort_order   integer     not null default 100,
  is_published boolean     not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists place_collections_pub_idx on public.place_collections (is_published, sort_order);

drop trigger if exists place_collections_set_updated_at on public.place_collections;
create trigger place_collections_set_updated_at
  before update on public.place_collections
  for each row execute procedure public.set_updated_at();

alter table public.place_collections enable row level security;

drop policy if exists "place_collections_select_published" on public.place_collections;
create policy "place_collections_select_published"
  on public.place_collections for select
  using (is_published = true);

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop table if exists public.place_collections;
