-- ============================================================
-- CHỢ CÓC FKO — Mở rộng địa lý cho bảng places (toàn Nhật Bản)
-- Thêm cấp Vùng / Tỉnh / Thành phố + tọa độ, backfill = Fukuoka
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần (idempotent).
-- ============================================================

-- 1. Thêm cột địa lý phân cấp (cộng thêm, không phá dữ liệu cũ)
--    region     : vùng địa lý  (kyushu, kanto, kansai, ...)
--    prefecture : tỉnh/phủ/đô  (fukuoka, tokyo, osaka, ...)  ← trục lọc chính
--    city       : thành phố/quận (hakata-ku, chuo-ku, ...)
--    lat / lng  : tọa độ cho bản đồ & tìm "gần tôi"
--    Field `area` cũ giữ nguyên làm nhãn khu/phố chi tiết nhất.
alter table public.places add column if not exists region     text;
alter table public.places add column if not exists prefecture text;
alter table public.places add column if not exists city       text;
alter table public.places add column if not exists lat        double precision;
alter table public.places add column if not exists lng        double precision;

-- 2. Backfill: mọi địa điểm hiện có đều thuộc Fukuoka / Kyushu
update public.places
   set prefecture = coalesce(prefecture, 'fukuoka'),
       region     = coalesce(region, 'kyushu');

-- 3. Mặc định cho bản ghi mới (tránh NULL khi chưa khai báo)
alter table public.places alter column prefecture set default 'fukuoka';
alter table public.places alter column region     set default 'kyushu';

-- 4. Index cho lọc theo tỉnh / vùng (trục lọc chính khi mở rộng toàn quốc)
create index if not exists places_prefecture_idx on public.places (prefecture);
create index if not exists places_region_idx     on public.places (region);
create index if not exists places_pref_cat_idx   on public.places (prefecture, category);

-- ============================================================
-- Mã chuẩn tham chiếu (dùng làm giá trị cho region / prefecture).
-- Để text code cho nhất quán với cột `category` (không tạo FK table).
--
-- region:  kyushu | chugoku | shikoku | kansai | chubu | kanto | tohoku | hokkaido | okinawa
-- prefecture (47): fukuoka, saga, nagasaki, kumamoto, oita, miyazaki, kagoshima,
--                  tokyo, osaka, kyoto, hokkaido, ... (mã ASCII không dấu, viết thường)
-- ============================================================
