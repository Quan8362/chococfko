-- ============================================================
-- CHỢ CÓC FKO — Đếm lượt xem tin chợ đồ cũ (atomic)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================
--
-- Thay cho read-modify-write trong incrementListingView (bị race / lost-update
-- khi nhiều request cùng tăng view_count). Hàm tăng nguyên tử ngay trong DB.

create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.marketplace_listings
     set view_count = coalesce(view_count, 0) + 1
   where id = p_listing_id;
$$;

grant execute on function public.increment_listing_view(uuid) to anon, authenticated, service_role;
