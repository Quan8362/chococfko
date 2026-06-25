-- ============================================================
-- CHỢ CÓC FKO — Payment provenance split (Branch 2)
-- Chạy trong Supabase SQL Editor.
--
-- VẤN ĐỀ: payment_methods do ENRICHMENT (Google) sở hữu (credit_card/ic_card/cash).
-- Google KHÔNG có QR/PayPay, và người dùng cũng có thể muốn thêm/sửa. Để dữ liệu
-- người nhập KHÔNG bị enrichment ghi đè VÀ phần Google vẫn refresh được, ta TÁCH:
--   • payment_methods         (Google-owned) — enrichment ghi, form KHÔNG đụng.
--   • payment_methods_manual  (Human-owned)  — admin/cộng đồng ghi (QR, PayPay, và
--                                              mọi method người thêm/sửa). Enrichment
--                                              KHÔNG BAO GIỜ đụng (xem googleEnrich.ts).
-- Bộ lọc + hiển thị đọc HỢP (union khử trùng) của hai cột.
--
-- languages → TÁI SỬ DỤNG cột supported_languages (đã có, bộ lọc đã đọc).
-- good_for_solo → cột đã có sẵn (phase 1). → migration này KHÔNG thêm chúng.
--
-- AN TOÀN: chỉ THÊM 1 cột, idempotent, không phá dữ liệu.
-- ROLLBACK: ALTER TABLE public.places DROP COLUMN IF EXISTS payment_methods_manual;
-- ============================================================

alter table public.places add column if not exists payment_methods_manual text[];

-- GIN để lọc theo phương thức thanh toán người nhập (giống payment_methods).
create index if not exists places_payment_methods_manual_gin
  on public.places using gin (payment_methods_manual);

notify pgrst, 'reload schema';
