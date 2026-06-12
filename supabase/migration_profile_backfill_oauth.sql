-- ============================================================
-- CHỢ CÓC FKO — Backfill profiles.display_name + avatar_url từ
-- metadata OAuth (Google/Facebook/LINE) cho các user ĐÃ tồn tại.
-- Chạy 1 lần trong Supabase SQL Editor.
--
-- An toàn: chỉ điền khi cột đang NULL → KHÔNG đè tên người dùng
-- đã tự đặt trong /ho-so.
-- ============================================================

update public.profiles p
set
  display_name = coalesce(
    p.display_name,
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  ),
  avatar_url = coalesce(
    p.avatar_url,
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', '')
  )
from auth.users u
where u.id = p.id
  and (p.display_name is null or p.avatar_url is null);

-- Tạo profile cho user chưa có row (hiếm, phòng trường hợp trigger lỗi)
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  ),
  coalesce(
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', '')
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
