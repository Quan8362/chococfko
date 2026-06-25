-- ============================================================
-- CHỢ CÓC FKO — Bộ lọc mới từ Google Places (New) (Branch 1)
-- Chạy trong Supabase SQL Editor.
--
-- Thêm thuộc tính lọc/badge mới enrich từ Google (New), conservative positive-only:
--   • serves_vegetarian (boolean) ← servesVegetarianFood — "Có món chay".
--   • pet_policy        (đã có sẵn từ phase 1) ← allowsDogs → ghi 'allowed'.
--     allowsDogs CHỈ khẳng định "cho phép chó" → ghi 'allowed' (an toàn nhất);
--     KHÔNG suy ra leashed_ok/outdoor_only. Cột pet_policy KHÔNG thêm lại ở đây.
--
-- Positive-only + write-protection nằm ở lib/places/googleEnrich.ts: Google null
-- KHÔNG BAO GIỜ ghi đè; field_sources='manual' luôn được tôn trọng.
--
-- AN TOÀN: chỉ THÊM 1 cột, idempotent, không phá dữ liệu.
-- ROLLBACK: ALTER TABLE public.places DROP COLUMN IF EXISTS serves_vegetarian;
-- ============================================================

alter table public.places add column if not exists serves_vegetarian boolean;

notify pgrst, 'reload schema';
