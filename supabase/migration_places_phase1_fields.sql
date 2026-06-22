-- ============================================================
-- CHỢ CÓC FKO — Explore Platform Phase 1
-- Location data foundation & practical actions
--
-- Mở rộng bảng public.places với các trường có cấu trúc, tìm kiếm
-- được & hành động được (giá, giờ mở cửa, đặt chỗ, tiện ích, độ phù
-- hợp, liên kết hành động, "biết trước khi đi", xác minh nguồn…).
--
-- AN TOÀN:
--   • Chỉ THÊM cột (ADD COLUMN IF NOT EXISTS) — KHÔNG sửa/xoá cột cũ.
--   • Idempotent: chạy lại nhiều lần không lỗi, không nhân đôi dữ liệu.
--   • CHECK constraint đều cho phép NULL (Postgres bỏ qua CHECK khi
--     biểu thức = NULL) → KHÔNG phá bản ghi cũ (mọi cột mới = NULL).
--   • Backfill CHỈ những giá trị suy ra CHẮC CHẮN (price_type ⟵ fee).
--     KHÔNG bịa dữ liệu (bbq/camping/giờ mở cửa… để NULL = chưa rõ).
--   • RLS giữ nguyên: places vẫn public SELECT; ghi chỉ qua service_role
--     (Admin server action). Cột mới thừa hưởng RLS của bảng → user
--     thường KHÔNG sửa được metadata địa điểm.
--
-- ROLLBACK (nếu cần — chỉ mất dữ liệu của các cột mới):
--   ALTER TABLE public.places DROP COLUMN IF EXISTS subcategories, ... ;
-- ============================================================

-- ── 1. NHẬN DẠNG & ĐỊA LÝ (bổ sung) ─────────────────────────────────
alter table public.places add column if not exists subcategories        text[];
alter table public.places add column if not exists postal_code          text;
alter table public.places add column if not exists nearest_station      text;
alter table public.places add column if not exists station_walk_minutes integer;
-- (Tên hiển thị đa ngôn ngữ ⟶ dùng bảng place_translations sẵn có.)
-- (Region tags ⟶ dùng hệ thống tags sẵn có: content_tags / type 'place'.)

-- ── 2. GIÁ ─────────────────────────────────────────────────────────
-- fee ('free'|'paid'|null) GIỮ NGUYÊN cho tương thích ngược. price_type
-- là phiên bản đầy đủ hơn (thêm 'varies'); backfill từ fee bên dưới.
alter table public.places add column if not exists price_type text;
alter table public.places add column if not exists price_min  integer;
alter table public.places add column if not exists price_max  integer;
alter table public.places add column if not exists currency   text;

-- ── 3. GIỜ MỞ CỬA & TÌNH TRẠNG ─────────────────────────────────────
-- opening_hours: jsonb có cấu trúc (Asia/Tokyo) — dùng cho "đang mở"
--   ở Phase 3. Quy ước: {"mon":[{"open":"09:00","close":"18:00"}], ...,
--   "ph":[...], "notes":"..."}. [] = đóng cả ngày; thiếu key = chưa rõ.
alter table public.places add column if not exists opening_hours    jsonb;
alter table public.places add column if not exists closed_days      text[];   -- ['mon','tue',...]
alter table public.places add column if not exists temporary_status text;      -- open|temporarily_closed|permanently_closed

-- ── 4. ĐẶT CHỖ / ĐỘ PHÙ HỢP / TIỆN ÍCH (tri-state: NULL = chưa rõ) ──
alter table public.places add column if not exists reservation_recommended boolean;
alter table public.places add column if not exists reservation_required    boolean;
alter table public.places add column if not exists walk_ins_accepted       boolean;
alter table public.places add column if not exists good_for_children       boolean;
alter table public.places add column if not exists good_for_solo           boolean;
alter table public.places add column if not exists good_for_groups         boolean;
alter table public.places add column if not exists parking                 text;   -- none|free|paid|nearby
alter table public.places add column if not exists indoor_outdoor          text;   -- indoor|outdoor|both
alter table public.places add column if not exists rainy_day_ok            boolean;
alter table public.places add column if not exists wheelchair_accessible   boolean;
alter table public.places add column if not exists smoking_policy          text;   -- no_smoking|smoking_allowed|separated
alter table public.places add column if not exists payment_methods         text[]; -- ['cash','credit_card','ic_card','qr']
alter table public.places add column if not exists supported_languages     text[]; -- ['ja','en','vi','ko','zh']
alter table public.places add column if not exists tattoo_policy           text;   -- allowed|not_allowed|covered_ok
alter table public.places add column if not exists bbq_available           boolean;
alter table public.places add column if not exists camping_available       boolean;
alter table public.places add column if not exists pet_policy              text;   -- allowed|not_allowed|leashed_ok|outdoor_only

-- ── 5. LIÊN KẾT HÀNH ĐỘNG ──────────────────────────────────────────
-- map_url / photo_url đã có sẵn. phone giữ ĐỊNH DẠNG HIỂN THỊ gốc;
-- phone_e164 là bản chuẩn hoá (để gọi/so khớp), backfill ở app.
alter table public.places add column if not exists official_website     text;
alter table public.places add column if not exists reservation_url      text;
alter table public.places add column if not exists reservation_provider text;
alter table public.places add column if not exists phone                text;
alter table public.places add column if not exists phone_e164           text;
alter table public.places add column if not exists social_url           text;
alter table public.places add column if not exists source_url           text;
alter table public.places add column if not exists last_verified_at     date;

-- ── 6. BIÊN TẬP & TIN CẬY ──────────────────────────────────────────
alter table public.places add column if not exists know_before_you_go   text;   -- rich text HTML
alter table public.places add column if not exists vi_tips              text;   -- rich text HTML (mẹo cho người Việt)
alter table public.places add column if not exists items_to_bring       text[];
alter table public.places add column if not exists recommended_duration_minutes integer;
alter table public.places add column if not exists best_visit_time      text;
alter table public.places add column if not exists expected_crowd_level text;   -- low|medium|high
alter table public.places add column if not exists japanese_phrases     jsonb;  -- [{"ja":"","romaji":"","vi":""}]
alter table public.places add column if not exists verification_status  text default 'unverified'; -- unverified|community|verified

-- ── 7. ĐIỀU KIỆN HIỂN THỊ (mặc định = giữ nguyên hành vi hiện tại) ──
alter table public.places add column if not exists search_eligible    boolean not null default true;
alter table public.places add column if not exists recommend_eligible boolean not null default true;

-- ── 8. BACKFILL (chỉ giá trị suy ra CHẮC CHẮN) ─────────────────────
-- price_type ⟵ fee khi fee đã biết ('free'/'paid'). KHÔNG suy 'varies'.
update public.places
   set price_type = fee
 where fee in ('free', 'paid')
   and price_type is null;

-- verification_status: bản ghi cũ NULL → 'unverified' (cột mới đã default
-- 'unverified' cho hàng MỚI; cập nhật các hàng cũ vừa thêm cột).
update public.places
   set verification_status = 'unverified'
 where verification_status is null;

-- ── 9. CHECK CONSTRAINT (đều NULL-safe — không phá hàng cũ) ─────────
alter table public.places drop constraint if exists places_price_type_check;
alter table public.places add  constraint places_price_type_check
  check (price_type in ('free', 'paid', 'varies'));

alter table public.places drop constraint if exists places_price_min_check;
alter table public.places add  constraint places_price_min_check
  check (price_min is null or price_min >= 0);

alter table public.places drop constraint if exists places_price_max_check;
alter table public.places add  constraint places_price_max_check
  check (price_max is null or price_max >= 0);

alter table public.places drop constraint if exists places_price_range_check;
alter table public.places add  constraint places_price_range_check
  check (price_min is null or price_max is null or price_max >= price_min);

alter table public.places drop constraint if exists places_currency_check;
alter table public.places add  constraint places_currency_check
  check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.places drop constraint if exists places_station_walk_check;
alter table public.places add  constraint places_station_walk_check
  check (station_walk_minutes is null or (station_walk_minutes >= 0 and station_walk_minutes <= 600));

alter table public.places drop constraint if exists places_duration_check;
alter table public.places add  constraint places_duration_check
  check (recommended_duration_minutes is null or (recommended_duration_minutes >= 0 and recommended_duration_minutes <= 10080));

alter table public.places drop constraint if exists places_temporary_status_check;
alter table public.places add  constraint places_temporary_status_check
  check (temporary_status in ('open', 'temporarily_closed', 'permanently_closed'));

alter table public.places drop constraint if exists places_parking_check;
alter table public.places add  constraint places_parking_check
  check (parking in ('none', 'free', 'paid', 'nearby'));

alter table public.places drop constraint if exists places_indoor_outdoor_check;
alter table public.places add  constraint places_indoor_outdoor_check
  check (indoor_outdoor in ('indoor', 'outdoor', 'both'));

alter table public.places drop constraint if exists places_smoking_check;
alter table public.places add  constraint places_smoking_check
  check (smoking_policy in ('no_smoking', 'smoking_allowed', 'separated'));

alter table public.places drop constraint if exists places_tattoo_check;
alter table public.places add  constraint places_tattoo_check
  check (tattoo_policy in ('allowed', 'not_allowed', 'covered_ok'));

alter table public.places drop constraint if exists places_pet_check;
alter table public.places add  constraint places_pet_check
  check (pet_policy in ('allowed', 'not_allowed', 'leashed_ok', 'outdoor_only'));

alter table public.places drop constraint if exists places_crowd_check;
alter table public.places add  constraint places_crowd_check
  check (expected_crowd_level in ('low', 'medium', 'high'));

alter table public.places drop constraint if exists places_verification_check;
alter table public.places add  constraint places_verification_check
  check (verification_status in ('unverified', 'community', 'verified'));

-- Toạ độ hợp lệ (cột lat/lng đã có từ migration_places_geo). NULL-safe.
alter table public.places drop constraint if exists places_lat_check;
alter table public.places add  constraint places_lat_check
  check (lat is null or (lat >= -90  and lat <= 90));

alter table public.places drop constraint if exists places_lng_check;
alter table public.places add  constraint places_lng_check
  check (lng is null or (lng >= -180 and lng <= 180));

-- ── 10. INDEX cho các trường sẽ lọc/tìm ────────────────────────────
create index if not exists places_price_type_idx on public.places (price_type);
create index if not exists places_temporary_status_idx on public.places (temporary_status);
-- Chỉ index những hàng đủ điều kiện hiển thị (truy vấn list/recommend phổ biến).
create index if not exists places_search_eligible_idx on public.places (search_eligible) where search_eligible = true;
create index if not exists places_recommend_eligible_idx on public.places (recommend_eligible) where recommend_eligible = true;
-- GIN cho mảng (lọc theo tiện ích / phân loại phụ / phương thức thanh toán).
create index if not exists places_subcategories_gin on public.places using gin (subcategories);
create index if not exists places_payment_methods_gin on public.places using gin (payment_methods);
-- Toạ độ cho bản đồ / "gần tôi" (Phase 3). Chỉ hàng có toạ độ.
create index if not exists places_geo_idx on public.places (lat, lng) where lat is not null and lng is not null;

-- ── 11. Reload schema cache để PostgREST thấy cột mới ──────────────
notify pgrst, 'reload schema';
