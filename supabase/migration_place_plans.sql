-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 5 (part 2/2)
-- Trip plans (lịch trình) + các điểm dừng có thời gian/ghi chú/chi phí.
--
-- Riêng tư mặc định. notes/participants & ghi chú điểm dừng KHÔNG lộ khi chia
-- sẻ trừ khi share_notes=true. Chia sẻ read-only qua share_token. RLS owner-only;
-- người xem chia sẻ KHÔNG sửa được (đọc qua server action service-role + token).
--
-- AN TOÀN: chỉ TẠO (idempotent). ROLLBACK: drop table place_plan_stops, place_plans;
-- ============================================================

create table if not exists public.place_plans (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  title         text        not null check (char_length(title) between 1 and 120),
  plan_date     date,
  start_location text,
  notes         text,                                  -- private (participants/notes)
  is_shareable  boolean     not null default false,
  share_notes   boolean     not null default false,
  share_token   text        unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.place_plan_stops (
  id               uuid        primary key default gen_random_uuid(),
  plan_id          uuid        not null references public.place_plans(id) on delete cascade,
  place_slug       text        not null,
  sort_order       int         not null default 0,
  arrival_time     time,
  departure_time   time,
  duration_minutes int         check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 1440)),
  note             text,
  est_cost         int         check (est_cost is null or est_cost >= 0),
  transport_note   text,
  created_at       timestamptz not null default now()
);

create index if not exists place_plans_user_idx        on public.place_plans (user_id, updated_at desc);
create index if not exists place_plans_share_token_idx on public.place_plans (share_token);
create index if not exists place_plan_stops_plan_idx   on public.place_plan_stops (plan_id, sort_order);

drop trigger if exists place_plans_set_updated_at on public.place_plans;
create trigger place_plans_set_updated_at
  before update on public.place_plans
  for each row execute procedure public.set_updated_at();

alter table public.place_plans      enable row level security;
alter table public.place_plan_stops enable row level security;

drop policy if exists "place_plans_select_own" on public.place_plans;
create policy "place_plans_select_own" on public.place_plans for select using (auth.uid() = user_id);
drop policy if exists "place_plans_insert_own" on public.place_plans;
create policy "place_plans_insert_own" on public.place_plans for insert with check (auth.uid() = user_id);
drop policy if exists "place_plans_update_own" on public.place_plans;
create policy "place_plans_update_own" on public.place_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "place_plans_delete_own" on public.place_plans;
create policy "place_plans_delete_own" on public.place_plans for delete using (auth.uid() = user_id);

drop policy if exists "place_plan_stops_select_own" on public.place_plan_stops;
create policy "place_plan_stops_select_own" on public.place_plan_stops for select
  using (exists (select 1 from public.place_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "place_plan_stops_insert_own" on public.place_plan_stops;
create policy "place_plan_stops_insert_own" on public.place_plan_stops for insert
  with check (exists (select 1 from public.place_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "place_plan_stops_update_own" on public.place_plan_stops;
create policy "place_plan_stops_update_own" on public.place_plan_stops for update
  using (exists (select 1 from public.place_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "place_plan_stops_delete_own" on public.place_plan_stops;
create policy "place_plan_stops_delete_own" on public.place_plan_stops for delete
  using (exists (select 1 from public.place_plans p where p.id = plan_id and p.user_id = auth.uid()));

notify pgrst, 'reload schema';
