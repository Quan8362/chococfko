-- ============================================================
-- CHỢ CÓC FKO — "Đã xác minh" + "Mới cập nhật" filters (Branch 3)
-- Chạy trong Supabase SQL Editor.
--
-- MỤC TIÊU: làm hai bộ lọc /places hoạt động bằng DỮ LIỆU NỘI BỘ (không phải
-- Google — Google không có khái niệm này):
--   • Verified  → TÁI SỬ DỤNG cột verification_status (đã có, bộ lọc đã đọc).
--     verified = (verification_status = 'verified'). Chỉ admin xác nhận tay mới
--     set 'verified'. Enrichment KHÔNG BAO GIỜ tự set (xem lib/places/enrichPlace.ts).
--     → migration này KHÔNG thêm cột verified.
--   • Recently updated → cần MỐC THỜI GIAN CHỈNH SỬA-BỞI-NGƯỜI, TÁCH KHỎI updated_at
--     (updated_at bị cron enrichment đụng mỗi tuần → không phản ánh sửa của người).
--
-- AN TOÀN: chỉ THÊM cột (ADD COLUMN IF NOT EXISTS), idempotent, không phá dữ liệu.
--
-- ROLLBACK: ALTER TABLE public.places DROP COLUMN IF EXISTS last_human_edit_at;
-- ============================================================

-- Mốc thời gian lần CHỈNH SỬA-BỞI-NGƯỜI gần nhất (admin sửa qua updatePlace, hoặc
-- cộng đồng đăng qua submitPlace). KHÔNG được cron/backfill/enrichPlace đụng tới.
alter table public.places add column if not exists last_human_edit_at timestamptz;

-- SEED cho hàng cũ: dùng created_at làm xấp xỉ tốt nhất.
-- LƯU Ý THÀNH THẬT: thời điểm sửa tay trong quá khứ KHÔNG khôi phục được, vì
-- enrichment đã ghi đè updated_at rồi. created_at là proxy hợp lý nhất; giá trị
-- sẽ CHÍNH XÁC dần về sau mỗi khi có người thật sự sửa/đăng.
update public.places
   set last_human_edit_at = created_at
 where last_human_edit_at is null;

-- Lọc "mới cập nhật" trong 30 ngày (xem lib/exploreParams.ts RECENTLY_UPDATED_WINDOW_DAYS).
create index if not exists places_last_human_edit_at_idx
  on public.places (last_human_edit_at);

-- Reload schema cache để PostgREST thấy cột mới.
notify pgrst, 'reload schema';
