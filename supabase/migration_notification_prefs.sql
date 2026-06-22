-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 7 (part 3/3)
-- Notification preferences (tùy chọn thông báo) — granular per-type opt in/out.
--
-- Mặc định AN TOÀN: chỉ lưu các LỰA CHỌN KHÁC mặc định (override). Loại thông báo
-- "return-user" gây ồn (event_soon, weekend_collection, plan_reminder) MẶC ĐỊNH
-- TẮT trong code (lib/notifications/prefs) → KHÔNG spam người dùng. notifyUsers
-- lọc người nhận theo bảng này. RLS: mỗi người chỉ quản lý tùy chọn của mình.
--
-- AN TOÀN: chỉ THÊM (idempotent). ROLLBACK ở cuối file.
-- ============================================================

create table if not exists public.notification_preferences (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  type       text        not null,
  enabled    boolean     not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create index if not exists notification_preferences_user_idx on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_select_own" on public.notification_preferences;
create policy "notif_prefs_select_own" on public.notification_preferences for select
  using (auth.uid() = user_id);
drop policy if exists "notif_prefs_insert_own" on public.notification_preferences;
create policy "notif_prefs_insert_own" on public.notification_preferences for insert
  with check (auth.uid() = user_id);
drop policy if exists "notif_prefs_update_own" on public.notification_preferences;
create policy "notif_prefs_update_own" on public.notification_preferences for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notif_prefs_delete_own" on public.notification_preferences;
create policy "notif_prefs_delete_own" on public.notification_preferences for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop table if exists public.notification_preferences;
