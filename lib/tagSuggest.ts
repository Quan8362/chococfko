import { normalizeTagName, MAX_TAGS } from './tags'

// Local, rule-based tag suggestions — no paid AI API. Everything here is a plain
// lookup over editable dictionaries so the logic is easy to extend later.
//
// Suggested values are tag *names* (user-generated content), not UI labels, so
// they are intentionally not run through i18n.

export type SuggestContentType = 'place' | 'post' | 'listing'

export interface SuggestInput {
  contentType: SuggestContentType
  category?: string | null
  listingType?: string | null
  area?: string | null
  prefecture?: string | null
  city?: string | null
  title?: string | null
  description?: string | null
  popular?: string[]
}

/** Category → seed tags, keyed by content type. Extend freely. */
export const CATEGORY_TAGS: Record<SuggestContentType, Record<string, string[]>> = {
  place: {
    landmark: ['Du lịch Nhật Bản', 'Địa điểm du lịch Nhật Bản'],
    food: ['Ăn uống', 'Quán ăn'],
    sea: ['Biển', 'BBQ'],
    camp: ['Camping', 'Du lịch Nhật Bản'],
    mountain: ['Leo núi', 'Thiên nhiên'],
    park: ['Công viên', 'Dã ngoại'],
    viet: ['Quán Việt', 'Ăn uống'],
    grocery: ['Tạp hóa Việt', 'Mua sắm'],
    izakaya: ['Izakaya', 'Ăn nhậu'],
    japanese: ['Quán Nhật', 'Ăn uống'],
    thai: ['Quán Thái', 'Ăn uống'],
    chinese: ['Quán Trung', 'Ăn uống'],
    korean: ['Quán Hàn', 'Ăn uống'],
    cafe_milk_tea: ['Cafe', 'Trà sữa'],
    kids_playground: ['Khu vui chơi', 'Gia đình'],
    onsen: ['Onsen', 'Du lịch Nhật Bản'],
  },
  post: {
    life: ['Cuộc sống ở Nhật'],
    paperwork: ['Giấy tờ', 'Thủ tục'],
    transport: ['Đi lại', 'Mua sắm'],
    study: ['Học tập', 'Tiếng Nhật'],
    work: ['Việc làm', 'Công việc'],
    story: ['Chia sẻ', 'Tâm sự'],
  },
  listing: {
    electronics: ['Đồ điện tử', 'Đồ cũ'],
    appliances: ['Đồ gia dụng', 'Đồ cũ'],
    furniture: ['Nội thất', 'Đồ cũ'],
    fashion: ['Thời trang', 'Đồ cũ'],
    mom_baby: ['Mẹ và bé', 'Đồ cũ'],
    books: ['Sách', 'Đồ cũ'],
    vehicle: ['Xe đạp', 'Xe cộ'],
    other: ['Đồ cũ'],
  },
}

/** Location keyword (folded) → tags. */
export const LOCATION_TAGS: Record<string, string[]> = {
  kumamoto: ['Kumamoto', 'Kyushu Travel', 'Road Trip Japan'],
  yatsushiro: ['Yatsushiro', 'Kumamoto', 'Kyushu Travel'],
  kumamon: ['Kumamon', 'Kumamoto'],
  aso: ['Aso', 'Kumamoto', 'Kyushu Travel'],
  fukuoka: ['Fukuoka', 'Kyushu Travel'],
  hakata: ['Hakata', 'Fukuoka'],
  tenjin: ['Tenjin', 'Fukuoka'],
  nakasu: ['Nakasu', 'Fukuoka'],
  daimyo: ['Daimyo', 'Fukuoka'],
  itoshima: ['Itoshima', 'Fukuoka', 'Biển'],
  dazaifu: ['Dazaifu', 'Fukuoka'],
  kitakyushu: ['Kitakyushu', 'Fukuoka'],
  mojiko: ['Mojiko', 'Kitakyushu'],
  yanagawa: ['Yanagawa', 'Fukuoka'],
  munakata: ['Munakata', 'Fukuoka'],
  kyushu: ['Kyushu Travel'],
  nagasaki: ['Nagasaki', 'Kyushu Travel'],
  oita: ['Oita', 'Onsen', 'Kyushu Travel'],
  beppu: ['Beppu', 'Onsen', 'Oita'],
  yufuin: ['Yufuin', 'Onsen', 'Oita'],
  kagoshima: ['Kagoshima', 'Kyushu Travel'],
  miyazaki: ['Miyazaki', 'Kyushu Travel'],
  saga: ['Saga', 'Kyushu Travel'],
  tokyo: ['Tokyo'],
  osaka: ['Osaka'],
  kyoto: ['Kyoto'],
}

/** Theme keyword (folded) → tags. */
export const KEYWORD_TAGS: Record<string, string[]> = {
  onsen: ['Onsen'],
  'suoi nuoc nong': ['Onsen'],
  camping: ['Camping'],
  'cam trai': ['Camping'],
  bbq: ['BBQ'],
  bien: ['Biển'],
  beach: ['Biển'],
  cafe: ['Cafe'],
  'ca phe': ['Cafe'],
  coffee: ['Cafe'],
  'tra sua': ['Trà sữa'],
  ramen: ['Ramen'],
  sushi: ['Sushi'],
  izakaya: ['Izakaya'],
  pho: ['Phở', 'Quán Việt'],
  'road trip': ['Road Trip Japan'],
  'lai xe': ['Road Trip Japan'],
  sakura: ['Hoa anh đào'],
  'hoa anh dao': ['Hoa anh đào'],
  'leo nui': ['Leo núi'],
  hiking: ['Leo núi'],
  'cong vien': ['Công viên'],
  park: ['Công viên'],
  'xe dap': ['Xe đạp'],
  bicycle: ['Xe đạp'],
  'noi that': ['Nội thất'],
  furniture: ['Nội thất'],
  'mien phi': ['Miễn phí'],
  free: ['Miễn phí'],
}

/** lowercase + strip Vietnamese/Latin diacritics, for forgiving keyword matching. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
}

/**
 * Suggest tags from the current draft using local heuristics:
 * category → location → title/description keywords → popular tags.
 * Returns de-duplicated display names (case-insensitive), capped.
 */
export function suggestTags(input: SuggestInput, limit = 12): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    const norm = normalizeTagName(name)
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    out.push(name)
  }

  // 1. Category seeds
  if (input.category) {
    for (const t of CATEGORY_TAGS[input.contentType]?.[input.category] ?? []) push(t)
  }

  // 2. Listing-type seeds
  if (input.contentType === 'listing') {
    if (input.listingType === 'free') push('Miễn phí')
    else if (input.listingType === 'sell') push('Cần bán')
  }

  // 3. Location + keyword scan over the free-text fields
  const haystack = fold(
    [input.area, input.prefecture, input.city, input.title, input.description]
      .filter(Boolean)
      .join(' '),
  )
  if (haystack) {
    for (const [key, tags] of Object.entries(LOCATION_TAGS)) {
      if (haystack.includes(key)) tags.forEach(push)
    }
    for (const [key, tags] of Object.entries(KEYWORD_TAGS)) {
      if (haystack.includes(key)) tags.forEach(push)
    }
  }

  // 4. Popular tags as a fallback tail
  for (const t of input.popular ?? []) push(t)

  return out.slice(0, Math.max(limit, MAX_TAGS))
}
