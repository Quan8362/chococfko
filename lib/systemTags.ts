// Canonical registry of system/common tags with per-locale display names.
//
// Source of truth for: (1) localized suggestion labels, (2) resolving any-language
// label back to a single canonical tag on save (no cross-language duplicates),
// (3) the SQL seed in supabase/migration_tag_i18n.sql (regenerate if this changes:
//     `node scripts/_gen_tag_seed.mjs`).
//
// Rules:
// - `canonical` = the original label used in the suggestion dictionaries / existing
//   data; its normalized form is the row identity (normalized_name). Keep stable.
// - `slug` = stable, language-independent URL segment (never changes per UI language).
// - Proper nouns (Kumamoto, Fukuoka, Kumamon, …) are intentionally NOT listed here
//   so they always fall back to their original name in every language.

export type TagLocale = 'vi' | 'en' | 'ja' | 'ko' | 'zh'

export interface SystemTag {
  canonical: string
  slug: string
  vi: string
  en: string
  ja: string
  ko: string
  zh: string
  /** Extra labels (any language/spelling) that also resolve to this tag. */
  aliases?: string[]
}

export const SYSTEM_TAGS: SystemTag[] = [
  // ── Travel / places ──────────────────────────────────────
  { canonical: 'Địa điểm du lịch Nhật Bản', slug: 'dia-diem-du-lich-nhat-ban', vi: 'Địa điểm du lịch Nhật Bản', en: 'Japan travel spots', ja: '日本の観光スポット', ko: '일본 관광지', zh: '日本旅游景点' },
  { canonical: 'Du lịch Nhật Bản', slug: 'du-lich-nhat-ban', vi: 'Du lịch Nhật Bản', en: 'Japan travel', ja: '日本旅行', ko: '일본 여행', zh: '日本旅游' },
  { canonical: 'Kyushu Travel', slug: 'kyushu-travel', vi: 'Du lịch Kyushu', en: 'Kyushu travel', ja: '九州旅行', ko: '규슈 여행', zh: '九州旅游' },
  { canonical: 'Road Trip Japan', slug: 'road-trip-japan', vi: 'Road Trip Nhật Bản', en: 'Road trip Japan', ja: '日本ドライブ旅行', ko: '일본 로드트립', zh: '日本自驾游' },
  { canonical: 'Thiên nhiên', slug: 'thien-nhien', vi: 'Thiên nhiên', en: 'Nature', ja: '自然', ko: '자연', zh: '自然' },
  { canonical: 'Hoa anh đào', slug: 'hoa-anh-dao', vi: 'Hoa anh đào', en: 'Cherry blossom', ja: '桜', ko: '벚꽃', zh: '樱花' },

  // ── Food & drink ─────────────────────────────────────────
  { canonical: 'Quán ăn', slug: 'quan-an', vi: 'Quán ăn', en: 'Food', ja: 'グルメ', ko: '음식', zh: '美食' },
  { canonical: 'Ăn uống', slug: 'an-uong', vi: 'Ăn uống', en: 'Food & drink', ja: '飲食', ko: '식음료', zh: '餐饮' },
  { canonical: 'Cafe', slug: 'cafe', vi: 'Cà phê', en: 'Cafe', ja: 'カフェ', ko: '카페', zh: '咖啡', aliases: ['Cà phê'] },
  { canonical: 'Trà sữa', slug: 'tra-sua', vi: 'Trà sữa', en: 'Milk tea', ja: 'ミルクティー', ko: '밀크티', zh: '奶茶' },
  { canonical: 'Izakaya', slug: 'izakaya', vi: 'Izakaya', en: 'Izakaya', ja: '居酒屋', ko: '이자카야', zh: '居酒屋', aliases: ['Quán nhậu Nhật'] },
  { canonical: 'Ăn nhậu', slug: 'an-nhau', vi: 'Ăn nhậu', en: 'Drinks & izakaya', ja: '飲み会', ko: '술자리', zh: '聚饮' },
  { canonical: 'Quán Việt', slug: 'quan-viet', vi: 'Quán Việt', en: 'Vietnamese food', ja: 'ベトナム料理', ko: '베트남 음식', zh: '越南菜' },
  { canonical: 'Tạp hóa Việt', slug: 'tap-hoa-viet', vi: 'Tạp hóa Việt', en: 'Vietnamese groceries', ja: 'ベトナム食材店', ko: '베트남 식료품', zh: '越南杂货', aliases: ['Tạp hoá Việt'] },
  { canonical: 'Quán Nhật', slug: 'quan-nhat', vi: 'Quán Nhật', en: 'Japanese food', ja: '和食', ko: '일식', zh: '日本料理' },
  { canonical: 'Quán Thái', slug: 'quan-thai', vi: 'Quán Thái', en: 'Thai food', ja: 'タイ料理', ko: '태국 음식', zh: '泰国菜' },
  { canonical: 'Quán Trung', slug: 'quan-trung', vi: 'Quán Trung', en: 'Chinese food', ja: '中華料理', ko: '중국 음식', zh: '中餐' },
  { canonical: 'Quán Hàn', slug: 'quan-han', vi: 'Quán Hàn', en: 'Korean food', ja: '韓国料理', ko: '한국 음식', zh: '韩国料理' },

  // ── Outdoor / nature ─────────────────────────────────────
  { canonical: 'Biển', slug: 'bien', vi: 'Biển', en: 'Beach', ja: '海・ビーチ', ko: '바다', zh: '海滩' },
  { canonical: 'BBQ', slug: 'bbq', vi: 'BBQ', en: 'BBQ', ja: 'バーベキュー', ko: '바비큐', zh: '烧烤' },
  { canonical: 'Camping', slug: 'camping', vi: 'Cắm trại', en: 'Camping', ja: 'キャンプ', ko: '캠핑', zh: '露营', aliases: ['Cắm trại'] },
  { canonical: 'Leo núi', slug: 'leo-nui', vi: 'Leo núi', en: 'Hiking', ja: '登山', ko: '등산', zh: '登山' },
  { canonical: 'Công viên', slug: 'cong-vien', vi: 'Công viên', en: 'Parks', ja: '公園', ko: '공원', zh: '公园' },
  { canonical: 'Dã ngoại', slug: 'da-ngoai', vi: 'Dã ngoại', en: 'Picnic', ja: 'ピクニック', ko: '소풍', zh: '野餐' },
  { canonical: 'Onsen', slug: 'onsen', vi: 'Onsen', en: 'Onsen', ja: '温泉', ko: '온천', zh: '温泉', aliases: ['Suối nước nóng'] },

  // ── Misc place ───────────────────────────────────────────
  { canonical: 'Mua sắm', slug: 'mua-sam', vi: 'Mua sắm', en: 'Shopping', ja: 'ショッピング', ko: '쇼핑', zh: '购物' },
  { canonical: 'Khu vui chơi', slug: 'khu-vui-choi', vi: 'Khu vui chơi', en: 'Playground', ja: '遊び場', ko: '놀이터', zh: '游乐场' },
  { canonical: 'Gia đình', slug: 'gia-dinh', vi: 'Gia đình', en: 'Family', ja: '家族向け', ko: '가족', zh: '家庭' },

  // ── Community post topics ────────────────────────────────
  { canonical: 'Cuộc sống ở Nhật', slug: 'cuoc-song-o-nhat', vi: 'Cuộc sống ở Nhật', en: 'Life in Japan', ja: '日本での生活', ko: '일본 생활', zh: '在日生活' },
  { canonical: 'Giấy tờ', slug: 'giay-to', vi: 'Giấy tờ', en: 'Paperwork', ja: '書類', ko: '서류', zh: '证件' },
  { canonical: 'Thủ tục', slug: 'thu-tuc', vi: 'Thủ tục', en: 'Procedures', ja: '手続き', ko: '절차', zh: '手续' },
  { canonical: 'Đi lại', slug: 'di-lai', vi: 'Đi lại', en: 'Transport', ja: '交通', ko: '교통', zh: '交通' },
  { canonical: 'Học tập', slug: 'hoc-tap', vi: 'Học tập', en: 'Study', ja: '勉強', ko: '공부', zh: '学习' },
  { canonical: 'Tiếng Nhật', slug: 'tieng-nhat', vi: 'Tiếng Nhật', en: 'Japanese language', ja: '日本語', ko: '일본어', zh: '日语' },
  { canonical: 'Việc làm', slug: 'viec-lam', vi: 'Việc làm', en: 'Jobs', ja: '求人', ko: '일자리', zh: '招聘' },
  { canonical: 'Công việc', slug: 'cong-viec', vi: 'Công việc', en: 'Work', ja: '仕事', ko: '업무', zh: '工作' },
  { canonical: 'Chia sẻ', slug: 'chia-se', vi: 'Chia sẻ', en: 'Sharing', ja: 'シェア', ko: '공유', zh: '分享' },
  { canonical: 'Tâm sự', slug: 'tam-su', vi: 'Tâm sự', en: 'Personal stories', ja: '体験談', ko: '이야기', zh: '心声' },

  // ── Marketplace ──────────────────────────────────────────
  { canonical: 'Đồ điện tử', slug: 'do-dien-tu', vi: 'Đồ điện tử', en: 'Electronics', ja: '電化製品', ko: '전자제품', zh: '电子产品' },
  { canonical: 'Đồ cũ', slug: 'do-cu', vi: 'Đồ cũ', en: 'Used goods', ja: '中古品', ko: '중고', zh: '二手' },
  { canonical: 'Đồ gia dụng', slug: 'do-gia-dung', vi: 'Đồ gia dụng', en: 'Home appliances', ja: '家電', ko: '가전', zh: '家电' },
  { canonical: 'Nội thất', slug: 'noi-that', vi: 'Nội thất', en: 'Furniture', ja: '家具', ko: '가구', zh: '家具' },
  { canonical: 'Thời trang', slug: 'thoi-trang', vi: 'Thời trang', en: 'Fashion', ja: 'ファッション', ko: '패션', zh: '时尚' },
  { canonical: 'Mẹ và bé', slug: 'me-va-be', vi: 'Mẹ và bé', en: 'Mom & baby', ja: 'ママ＆ベビー', ko: '엄마와 아기', zh: '母婴' },
  { canonical: 'Sách', slug: 'sach', vi: 'Sách', en: 'Books', ja: '本', ko: '책', zh: '书籍' },
  { canonical: 'Xe đạp', slug: 'xe-dap', vi: 'Xe đạp', en: 'Bicycle', ja: '自転車', ko: '자전거', zh: '自行车' },
  { canonical: 'Xe cộ', slug: 'xe-co', vi: 'Xe cộ', en: 'Vehicles', ja: '乗り物', ko: '차량', zh: '车辆' },
  { canonical: 'Miễn phí', slug: 'mien-phi', vi: 'Miễn phí', en: 'Free', ja: '無料', ko: '무료', zh: '免费' },
  { canonical: 'Cần bán', slug: 'can-ban', vi: 'Cần bán', en: 'For sale', ja: '販売', ko: '판매', zh: '出售' },
]

// Local normalizer — mirrors public.tag_normalize / normalizeTagName, kept here to
// avoid an import cycle with lib/tags.
function norm(s: string): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

let LOOKUP: Map<string, SystemTag> | null = null
function lookup(): Map<string, SystemTag> {
  if (LOOKUP) return LOOKUP
  const m = new Map<string, SystemTag>()
  for (const st of SYSTEM_TAGS) {
    const labels = [st.canonical, st.vi, st.en, st.ja, st.ko, st.zh, ...(st.aliases ?? [])]
    for (const label of labels) {
      const k = norm(label)
      if (k && !m.has(k)) m.set(k, st)
    }
  }
  LOOKUP = m
  return m
}

/** Resolve any-language label to its system tag, or undefined for non-system tags. */
export function findSystemTag(name: string): SystemTag | undefined {
  return lookup().get(norm(name))
}

const LOCALES: TagLocale[] = ['vi', 'en', 'ja', 'ko', 'zh']

/** Localize a suggestion label for the current UI locale (proper nouns unchanged). */
export function localizeSystemLabel(name: string, locale: string): string {
  const st = findSystemTag(name)
  if (!st) return name
  const key = (LOCALES as string[]).includes(locale) ? (locale as TagLocale) : 'vi'
  return st[key] || st.canonical
}
