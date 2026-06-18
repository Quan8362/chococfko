-- ============================================================
-- CHỢ CÓC FKO — Đa ngôn ngữ cho tags (display_name theo locale)
-- Chạy trong Supabase SQL Editor. Idempotent.
-- ⚠️  Phần seed được SINH TỰ ĐỘNG từ lib/systemTags.ts
--     (chạy lại: node scripts/_gen_tag_seed.mjs). Không sửa tay phần seed.
-- ============================================================
--
-- Thêm tên hiển thị theo từng ngôn ngữ + cờ tag hệ thống. Tag thường (tên riêng:
-- Kumamoto, Fukuoka, Kumamon…) để các cột display_name = NULL → fallback về name.
-- Slug & normalized_name GIỮ NGUYÊN (không đổi URL, không tạo bản ghi trùng).

alter table public.tags add column if not exists display_name_vi text;
alter table public.tags add column if not exists display_name_en text;
alter table public.tags add column if not exists display_name_ja text;
alter table public.tags add column if not exists display_name_ko text;
alter table public.tags add column if not exists display_name_zh text;
alter table public.tags add column if not exists is_system_tag boolean not null default false;

-- Seed/cập nhật bản dịch cho các tag hệ thống phổ biến.
-- on conflict (normalized_name): chỉ cập nhật bản dịch + cờ, GIỮ NGUYÊN name/slug
-- của bản ghi đã có → không phá URL, không đổi tên tag người dùng đã thấy.
insert into public.tags
  (slug, name, normalized_name, display_name_vi, display_name_en, display_name_ja, display_name_ko, display_name_zh, is_system_tag)
values
  ('dia-diem-du-lich-nhat-ban', 'Địa điểm du lịch Nhật Bản', 'địa điểm du lịch nhật bản', 'Địa điểm du lịch Nhật Bản', 'Japan travel spots', '日本の観光スポット', '일본 관광지', '日本旅游景点', true),
  ('du-lich-nhat-ban', 'Du lịch Nhật Bản', 'du lịch nhật bản', 'Du lịch Nhật Bản', 'Japan travel', '日本旅行', '일본 여행', '日本旅游', true),
  ('kyushu-travel', 'Kyushu Travel', 'kyushu travel', 'Du lịch Kyushu', 'Kyushu travel', '九州旅行', '규슈 여행', '九州旅游', true),
  ('road-trip-japan', 'Road Trip Japan', 'road trip japan', 'Road Trip Nhật Bản', 'Road trip Japan', '日本ドライブ旅行', '일본 로드트립', '日本自驾游', true),
  ('thien-nhien', 'Thiên nhiên', 'thiên nhiên', 'Thiên nhiên', 'Nature', '自然', '자연', '自然', true),
  ('hoa-anh-dao', 'Hoa anh đào', 'hoa anh đào', 'Hoa anh đào', 'Cherry blossom', '桜', '벚꽃', '樱花', true),
  ('quan-an', 'Quán ăn', 'quán ăn', 'Quán ăn', 'Food', 'グルメ', '음식', '美食', true),
  ('an-uong', 'Ăn uống', 'ăn uống', 'Ăn uống', 'Food & drink', '飲食', '식음료', '餐饮', true),
  ('cafe', 'Cafe', 'cafe', 'Cà phê', 'Cafe', 'カフェ', '카페', '咖啡', true),
  ('tra-sua', 'Trà sữa', 'trà sữa', 'Trà sữa', 'Milk tea', 'ミルクティー', '밀크티', '奶茶', true),
  ('izakaya', 'Izakaya', 'izakaya', 'Izakaya', 'Izakaya', '居酒屋', '이자카야', '居酒屋', true),
  ('an-nhau', 'Ăn nhậu', 'ăn nhậu', 'Ăn nhậu', 'Drinks & izakaya', '飲み会', '술자리', '聚饮', true),
  ('quan-viet', 'Quán Việt', 'quán việt', 'Quán Việt', 'Vietnamese food', 'ベトナム料理', '베트남 음식', '越南菜', true),
  ('tap-hoa-viet', 'Tạp hóa Việt', 'tạp hóa việt', 'Tạp hóa Việt', 'Vietnamese groceries', 'ベトナム食材店', '베트남 식료품', '越南杂货', true),
  ('quan-nhat', 'Quán Nhật', 'quán nhật', 'Quán Nhật', 'Japanese food', '和食', '일식', '日本料理', true),
  ('quan-thai', 'Quán Thái', 'quán thái', 'Quán Thái', 'Thai food', 'タイ料理', '태국 음식', '泰国菜', true),
  ('quan-trung', 'Quán Trung', 'quán trung', 'Quán Trung', 'Chinese food', '中華料理', '중국 음식', '中餐', true),
  ('quan-han', 'Quán Hàn', 'quán hàn', 'Quán Hàn', 'Korean food', '韓国料理', '한국 음식', '韩国料理', true),
  ('bien', 'Biển', 'biển', 'Biển', 'Beach', '海・ビーチ', '바다', '海滩', true),
  ('bbq', 'BBQ', 'bbq', 'BBQ', 'BBQ', 'バーベキュー', '바비큐', '烧烤', true),
  ('camping', 'Camping', 'camping', 'Cắm trại', 'Camping', 'キャンプ', '캠핑', '露营', true),
  ('leo-nui', 'Leo núi', 'leo núi', 'Leo núi', 'Hiking', '登山', '등산', '登山', true),
  ('cong-vien', 'Công viên', 'công viên', 'Công viên', 'Parks', '公園', '공원', '公园', true),
  ('da-ngoai', 'Dã ngoại', 'dã ngoại', 'Dã ngoại', 'Picnic', 'ピクニック', '소풍', '野餐', true),
  ('onsen', 'Onsen', 'onsen', 'Onsen', 'Onsen', '温泉', '온천', '温泉', true),
  ('mua-sam', 'Mua sắm', 'mua sắm', 'Mua sắm', 'Shopping', 'ショッピング', '쇼핑', '购物', true),
  ('khu-vui-choi', 'Khu vui chơi', 'khu vui chơi', 'Khu vui chơi', 'Playground', '遊び場', '놀이터', '游乐场', true),
  ('gia-dinh', 'Gia đình', 'gia đình', 'Gia đình', 'Family', '家族向け', '가족', '家庭', true),
  ('cuoc-song-o-nhat', 'Cuộc sống ở Nhật', 'cuộc sống ở nhật', 'Cuộc sống ở Nhật', 'Life in Japan', '日本での生活', '일본 생활', '在日生活', true),
  ('giay-to', 'Giấy tờ', 'giấy tờ', 'Giấy tờ', 'Paperwork', '書類', '서류', '证件', true),
  ('thu-tuc', 'Thủ tục', 'thủ tục', 'Thủ tục', 'Procedures', '手続き', '절차', '手续', true),
  ('di-lai', 'Đi lại', 'đi lại', 'Đi lại', 'Transport', '交通', '교통', '交通', true),
  ('hoc-tap', 'Học tập', 'học tập', 'Học tập', 'Study', '勉強', '공부', '学习', true),
  ('tieng-nhat', 'Tiếng Nhật', 'tiếng nhật', 'Tiếng Nhật', 'Japanese language', '日本語', '일본어', '日语', true),
  ('viec-lam', 'Việc làm', 'việc làm', 'Việc làm', 'Jobs', '求人', '일자리', '招聘', true),
  ('cong-viec', 'Công việc', 'công việc', 'Công việc', 'Work', '仕事', '업무', '工作', true),
  ('chia-se', 'Chia sẻ', 'chia sẻ', 'Chia sẻ', 'Sharing', 'シェア', '공유', '分享', true),
  ('tam-su', 'Tâm sự', 'tâm sự', 'Tâm sự', 'Personal stories', '体験談', '이야기', '心声', true),
  ('do-dien-tu', 'Đồ điện tử', 'đồ điện tử', 'Đồ điện tử', 'Electronics', '電化製品', '전자제품', '电子产品', true),
  ('do-cu', 'Đồ cũ', 'đồ cũ', 'Đồ cũ', 'Used goods', '中古品', '중고', '二手', true),
  ('do-gia-dung', 'Đồ gia dụng', 'đồ gia dụng', 'Đồ gia dụng', 'Home appliances', '家電', '가전', '家电', true),
  ('noi-that', 'Nội thất', 'nội thất', 'Nội thất', 'Furniture', '家具', '가구', '家具', true),
  ('thoi-trang', 'Thời trang', 'thời trang', 'Thời trang', 'Fashion', 'ファッション', '패션', '时尚', true),
  ('me-va-be', 'Mẹ và bé', 'mẹ và bé', 'Mẹ và bé', 'Mom & baby', 'ママ＆ベビー', '엄마와 아기', '母婴', true),
  ('sach', 'Sách', 'sách', 'Sách', 'Books', '本', '책', '书籍', true),
  ('xe-dap', 'Xe đạp', 'xe đạp', 'Xe đạp', 'Bicycle', '自転車', '자전거', '自行车', true),
  ('xe-co', 'Xe cộ', 'xe cộ', 'Xe cộ', 'Vehicles', '乗り物', '차량', '车辆', true),
  ('mien-phi', 'Miễn phí', 'miễn phí', 'Miễn phí', 'Free', '無料', '무료', '免费', true),
  ('can-ban', 'Cần bán', 'cần bán', 'Cần bán', 'For sale', '販売', '판매', '出售', true)
on conflict (normalized_name) do update set
  display_name_vi = excluded.display_name_vi,
  display_name_en = excluded.display_name_en,
  display_name_ja = excluded.display_name_ja,
  display_name_ko = excluded.display_name_ko,
  display_name_zh = excluded.display_name_zh,
  is_system_tag   = true,
  updated_at      = now();

notify pgrst, 'reload schema';
