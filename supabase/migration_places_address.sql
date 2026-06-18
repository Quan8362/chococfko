-- ============================================================
-- CHỢ CÓC FKO — Thêm cột address (địa chỉ chi tiết) cho bảng places
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần (idempotent).
-- ============================================================
--
-- Mô hình địa lý hoàn chỉnh:
--   prefecture : tỉnh/phủ/đô (kumamoto) ← trục lọc chính, đã có
--   city       : thành phố/quận (yatsushiro)              ← đã có
--   area       : nhãn khu/phố chi tiết nhất (tự do)        ← đã có
--   address    : địa chỉ đầy đủ nếu có (新港町1丁目25, ...)  ← THÊM MỚI
-- Cộng thêm cột, không phá dữ liệu cũ; bản ghi cũ giữ address = NULL.

alter table public.places add column if not exists address text;

notify pgrst, 'reload schema';
