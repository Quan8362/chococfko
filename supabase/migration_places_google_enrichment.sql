-- ============================================================
-- CHỢ CÓC FKO — Auto-enrichment from Google Places API (New)
-- Chạy trong Supabase SQL Editor.
--
-- MỤC ĐÍCH:
--   Tự động điền các thuộc tính địa điểm (giờ mở cửa, đỗ xe, đặt chỗ,
--   trong nhà/ngoài trời, giá, phù hợp trẻ em…) từ Google Places API (New).
--   Job enrichment GHI THẲNG vào các cột "live" đã có sẵn từ
--   migration_places_phase1_fields.sql (opening_hours, parking,
--   good_for_children, reservation_recommended, indoor_outdoor, rainy_day_ok,
--   price_min/price_max/price_type/fee…) — bộ lọc & badge đọc đúng các cột đó,
--   nên migration này KHÔNG thêm cột "live" mới.
--
-- Link tới Google: TÁI SỬ DỤNG cột provider_place_id (+ location_provider='google')
--   đã có từ migration_places_location_provider.sql. KHÔNG thêm google_place_id.
--
-- AN TOÀN:
--   • Chỉ THÊM 3 cột phụ trợ (ADD COLUMN IF NOT EXISTS) — không sửa/xoá cột cũ.
--   • Idempotent: chạy lại nhiều lần không lỗi.
--   • Mọi cột mới = NULL cho hàng cũ → không thay đổi hành vi hiện tại.
--   • field_sources bảo vệ dữ liệu người nhập: enrichment KHÔNG ghi đè cột do
--     admin/cộng đồng nhập tay (xem lib/places/googleEnrich.ts → applyEnrichment).
--
-- ROLLBACK (chỉ mất dữ liệu của 3 cột mới):
--   ALTER TABLE public.places
--     DROP COLUMN IF EXISTS regular_opening_hours,
--     DROP COLUMN IF EXISTS google_enrichment,
--     DROP COLUMN IF EXISTS field_sources;
-- ============================================================

-- Lịch mở cửa "thô" từ Google (regularOpeningHours.periods) — lưu nguyên bản để
-- audit & tính lại "open now". Cột "live" opening_hours (định dạng nội bộ) vẫn là
-- nguồn mà UI/bộ lọc đọc; cột này chỉ phục vụ kiểm tra/tham chiếu.
alter table public.places add column if not exists regular_opening_hours jsonb;

-- Bản ghi lần fetch gần nhất: { fetched_at, place_id, match:{displayName,
-- confidence, low_confidence, reason}, raw:{...subset đã lấy...} }. KHÔNG hiển thị
-- trực tiếp cho người dùng — chỉ là dấu vết kiểm toán (audit trail).
alter table public.places add column if not exists google_enrichment jsonb;

-- Provenance theo từng thuộc tính: { "<column>": 'manual' | 'google' | 'inferred' }.
-- Dùng để KHÔNG bao giờ ghi đè dữ liệu do người nhập tay ('manual'), và để biết
-- giá trị nào do Google/suy luận sinh ra (có thể refresh lại an toàn).
alter table public.places add column if not exists field_sources jsonb;

-- Lọc nhanh "địa điểm chưa từng enrichment" cho cron/backfill (job đọc cột này).
create index if not exists places_google_enrichment_null_idx
  on public.places ((google_enrichment is null));

-- Reload schema cache để PostgREST thấy cột mới.
notify pgrst, 'reload schema';
