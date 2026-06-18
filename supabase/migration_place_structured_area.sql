-- ============================================================
-- CHỢ CÓC FKO — Khu vực có cấu trúc (structured area) cho bảng places
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần (idempotent).
-- ============================================================
--
-- Trước đây cột `area` lưu free text trộn ngôn ngữ, VD:
--   "Sasaguri, gần Hakata, Fukuoka"
-- → từ tiếng Việt "gần" không dịch được khi đổi ngôn ngữ website.
--
-- Tách thành các trường có cấu trúc. Tên địa danh KHÔNG dịch; chỉ TỪ quan hệ
-- (relation_type) được dịch qua i18n khi render:
--   area_main          : khu vực chính           VD "Sasaguri"
--   nearby_place       : địa danh lân cận (tuỳ chọn) VD "Hakata"
--   city_or_prefecture : thành phố/tỉnh           VD "Fukuoka"
--   relation_type      : quan hệ — near | in | central | suburb
--
-- Cột `area` cũ vẫn giữ (làm fallback + index tìm kiếm) — actions sẽ ghi vào đó
-- một chuỗi trung tính (chỉ tên địa danh, không có từ "gần"/"near").
-- Bản ghi cũ giữ nguyên area_main = NULL → UI tự fallback về `area`.

alter table public.places add column if not exists area_main          text;
alter table public.places add column if not exists nearby_place       text;
alter table public.places add column if not exists city_or_prefecture text;
alter table public.places add column if not exists relation_type      text
  check (relation_type is null or relation_type in ('near', 'in', 'central', 'suburb'));

notify pgrst, 'reload schema';
