-- ============================================================
-- CHỢ CÓC FKO — Siết quyền đọc marketplace_bids (privacy)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ============================================================
--
-- Trước đây policy "mb_select" dùng USING (true) → bất kỳ ai có anon key (public)
-- đều query thẳng bảng marketplace_bids đọc được bidder_id + amount thật, vô hiệu
-- hoá việc che tên người đấu giá trong getListingBids (h***3).
--
-- Lịch sử đấu giá hiển thị cho người dùng được phục vụ qua getListingBids() chạy
-- bằng service-role (bypass RLS) nên KHÔNG bị ảnh hưởng bởi thay đổi này.
-- Người dùng client chỉ còn đọc được:
--   - lượt đấu giá của chính mình
--   - mọi lượt đấu giá trên tin do mình đăng (chủ tin)

drop policy if exists "mb_select" on public.marketplace_bids;

-- Người đặt giá đọc được lượt của chính mình
drop policy if exists "mb_select_own" on public.marketplace_bids;
create policy "mb_select_own" on public.marketplace_bids
  for select to authenticated
  using (auth.uid() = bidder_id);

-- Chủ tin đọc được mọi lượt đấu giá trên tin của mình
drop policy if exists "mb_select_listing_owner" on public.marketplace_bids;
create policy "mb_select_listing_owner" on public.marketplace_bids
  for select to authenticated
  using (
    exists (
      select 1 from public.marketplace_listings l
      where l.id = marketplace_bids.listing_id
        and l.user_id = auth.uid()
    )
  );
