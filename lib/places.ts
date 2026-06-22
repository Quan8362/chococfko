import type { LocalizedTag } from './tags';

export type Fee = 'free' | 'paid' | null;

// Quan hệ địa lý giữa areaMain và nearbyPlace — chỉ TỪ NÀY được dịch qua i18n,
// còn tên địa danh (areaMain/nearbyPlace/cityOrPrefecture) KHÔNG bao giờ dịch.
export type RelationType = 'near' | 'in' | 'central' | 'suburb';
export const RELATION_TYPES: RelationType[] = ['near', 'in', 'central', 'suburb'];

export interface Place {
  slug: string; name: string; area: string; desc: string;
  category: string; categoryLabel: string; fee: Fee;
  mapUrl: string; photoUrl: string; img: string; imgFallback: string;
  body?: string | null; // rich text HTML mô tả chi tiết (từ DB)
  // Phân cấp địa lý (mở rộng toàn Nhật) — backfill mặc định Fukuoka/Kyushu
  region?: string | null; prefecture?: string | null; city?: string | null;
  address?: string | null;
  lat?: number | null; lng?: number | null;
  // ── Map UX Phase 4: provider provenance + coordinate audit (optional) ──
  locationProvider?: string | null;
  providerPlaceId?: string | null;
  providerFormattedAddress?: string | null;
  providerMapsUrl?: string | null;
  providerDataUpdatedAt?: string | null;
  countryCode?: string | null;
  locationSource?: string | null;
  locationManuallyAdjusted?: boolean | null;
  locationConfirmedAt?: string | null;
  locationConfirmedBy?: string | null;
  // Khu vực có cấu trúc — render text cuối qua i18n thay vì lưu text trộn ngôn ngữ.
  areaMain?: string | null;        // VD "Sasaguri"
  nearbyPlace?: string | null;     // VD "Hakata" (tuỳ chọn)
  cityOrPrefecture?: string | null; // VD "Fukuoka"
  relationType?: RelationType | null; // VD "near"
  tags?: LocalizedTag[] | null; // attached for search/display (optional)

  // ── Explore Phase 1: structured, searchable, actionable fields ──
  // All optional; null/undefined = unknown (never a fake default).
  subcategories?: string[] | null;
  postalCode?: string | null;
  nearestStation?: string | null;
  stationWalkMinutes?: number | null;
  // Price
  priceType?: 'free' | 'paid' | 'varies' | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  // Hours & status
  openingHours?: Record<string, unknown> | null;
  closedDays?: string[] | null;
  temporaryStatus?: 'open' | 'temporarily_closed' | 'permanently_closed' | null;
  // Reservation / suitability / facilities (tri-state: null = unknown)
  reservationRecommended?: boolean | null;
  reservationRequired?: boolean | null;
  walkInsAccepted?: boolean | null;
  goodForChildren?: boolean | null;
  goodForSolo?: boolean | null;
  goodForGroups?: boolean | null;
  parking?: string | null;
  indoorOutdoor?: string | null;
  rainyDayOk?: boolean | null;
  wheelchairAccessible?: boolean | null;
  smokingPolicy?: string | null;
  paymentMethods?: string[] | null;
  supportedLanguages?: string[] | null;
  tattooPolicy?: string | null;
  bbqAvailable?: boolean | null;
  campingAvailable?: boolean | null;
  petPolicy?: string | null;
  // Action links
  officialWebsite?: string | null;
  reservationUrl?: string | null;
  reservationProvider?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  socialUrl?: string | null;
  sourceUrl?: string | null;
  lastVerifiedAt?: string | null;
  // Editorial & trust
  knowBeforeYouGo?: string | null;
  viTips?: string | null;
  itemsToBring?: string[] | null;
  recommendedDurationMinutes?: number | null;
  bestVisitTime?: string | null;
  expectedCrowdLevel?: string | null;
  japanesePhrases?: { ja: string; romaji: string; vi: string }[] | null;
  verificationStatus?: string | null;
  // Visibility / eligibility
  searchEligible?: boolean | null;
  recommendEligible?: boolean | null;
  // Timestamps (for "newest" / "recently updated" sorts & filters)
  createdAt?: string | null;
  updatedAt?: string | null;
  // Transient (attached at query time, not stored): distance for "nearby"/"nearest"
  // sort, and a community-activity score (ratings+comments) for the "community" sort.
  distanceKm?: number | null;
  communityActivity?: number | null;
}

// Map các chuỗi "area" tiếng Việt cũ (free text) sang i18n key tương ứng.
// Dùng cho địa điểm legacy chưa có trường có cấu trúc.
export const AREA_LEGACY_KEY_MAP: Record<string, string> = {
  'Tối': 'area_toi', 'Sáng': 'area_sang', 'Trưa': 'area_trua',
  'Chiều': 'area_chieu', 'Trưa / Tối': 'area_trua_toi',
  'Gần Ohori': 'area_near_ohori', 'Gần Fukuoka Tower': 'area_near_fukuoka_tower',
  'Dễ · hợp người mới': 'area_mountain_easy_beginner',
  'Dễ–TB · gần thành phố': 'area_mountain_easymid_city',
  'Dễ–TB': 'area_mountain_easymid',
  'Trung bình · rất nổi tiếng': 'area_mountain_mid_popular',
  'Trung bình · thiên nhiên đẹp': 'area_mountain_mid_nature',
  'Trung bình · mùa lá đỏ': 'area_mountain_mid_autumn',
  'Trung bình · view biển': 'area_mountain_mid_seaview',
  'Có cáp treo · ngắm đêm': 'area_mountain_cable_night',
  'Umi-machi · gần Dazaifu': 'area_umi_near_dazaifu',
  'Đảo Nokonoshima': 'area_nokonoshima_island',
};

type AreaTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Build the localized "area" display string.
 * - Nếu có areaMain (dữ liệu có cấu trúc): chỉ dịch TỪ quan hệ (near/in/…),
 *   ghép tên địa danh theo template từng ngôn ngữ. nearbyPlace trống → chỉ
 *   hiện areaMain + cityOrPrefecture.
 * - Nếu không: fallback về text cũ (qua AREA_LEGACY_KEY_MAP nếu khớp).
 */
export function formatArea(
  place: Pick<Place, 'area' | 'areaMain' | 'nearbyPlace' | 'cityOrPrefecture' | 'relationType'>,
  t: AreaTranslator,
): string {
  const main = place.areaMain?.trim();
  if (!main) {
    const legacy = place.area ?? '';
    const key = AREA_LEGACY_KEY_MAP[legacy];
    return key ? t(key) : legacy;
  }
  const nearby = place.nearbyPlace?.trim() || '';
  const city = place.cityOrPrefecture?.trim() || '';
  const relation = t(`area_relation_${place.relationType || 'near'}`);

  let out: string;
  if (nearby) {
    out = t('area_format_with_nearby', { main, relation, nearby, city });
  } else if (city) {
    out = t('area_format_no_nearby', { main, city });
  } else {
    out = main;
  }
  // Dọn dấu phân tách/khoảng trắng dư khi một thành phần rỗng
  // (relation rỗng ở ngôn ngữ dùng dấu cách, hoặc city/nearby trống).
  return out
    .replace(/\s+([,，、・])/g, '$1')   // bỏ space trước dấu phân tách
    .replace(/([,，、・])\s*(?=[,，、・])/g, '') // gộp dấu phân tách liền nhau
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,，、・]+|[\s,，、・]+$/g, '') // bỏ dấu phân tách ở đầu/cuối
    .trim();
}

// Ghép các tên địa danh có cấu trúc thành 1 chuỗi trung tính (KHÔNG có từ quan
// hệ) để lưu vào cột `area` cũ — phục vụ tìm kiếm & fallback hiển thị.
export function neutralAreaString(parts: {
  areaMain?: string | null; nearbyPlace?: string | null; cityOrPrefecture?: string | null;
}): string {
  return [parts.areaMain, parts.nearbyPlace, parts.cityOrPrefecture]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ');
}
// Snake_case columns written for the structured-area group.
export interface StructuredAreaColumns {
  area: string;
  area_main: string;
  nearby_place: string | null;
  city_or_prefecture: string | null;
  relation_type: RelationType;
}

/**
 * Parse the structured-area inputs from a submitted form into the DB columns.
 * Shared by the admin edit action and the user place-submission action so both
 * paths persist identical shapes.
 *
 * `relation_type` falls back to 'near' (the neutral "gần") only when no valid
 * value was submitted — for existing records the form always submits the saved
 * value, so this default applies only to genuinely new/empty records.
 */
export function parseStructuredArea(form: Pick<FormData, 'get'>): StructuredAreaColumns {
  const areaMain = (form.get('area_main') as string | null)?.trim() || '';
  const nearbyPlace = (form.get('nearby_place') as string | null)?.trim() || null;
  const cityOrPrefecture = (form.get('city_or_prefecture') as string | null)?.trim() || null;
  const relRaw = (form.get('relation_type') as string | null) || 'near';
  const relationType: RelationType = RELATION_TYPES.includes(relRaw as RelationType)
    ? (relRaw as RelationType) : 'near';
  return {
    // `area` cũ = chuỗi trung tính (chỉ tên địa danh) cho tìm kiếm & fallback.
    area: neutralAreaString({ areaMain, nearbyPlace, cityOrPrefecture }),
    area_main: areaMain,
    nearby_place: nearbyPlace,
    city_or_prefecture: cityOrPrefecture,
    relation_type: relationType,
  };
}

export interface Category { code: string; short: string; full: string; }

// Single source of truth for category emoji (also mirrored in PlaceCard /
// homepage for their local use). 🏯 for landmark must stay unchanged.
export const categoryEmoji: Record<string, string> = {
  landmark: "🏯",
  food: "🍜",
  sea: "🏖️",
  camp: "⛺",
  mountain: "⛰️",
  park: "🌳",
  viet: "🥢",
  grocery: "🛒",
  izakaya: "🍺",
  japanese: "🍣",
  thai: "🌶️",
  chinese: "🥡",
  korean: "🥩",
  cafe_milk_tea: "☕",
  kids_playground: "🎠",
  onsen: "♨️",
};

export const categories: Category[] = [
  { "code": "landmark", "short": "Du lịch",   "full": "Du lịch" },
  { "code": "food",     "short": "Ăn đêm",    "full": "Ăn uống & vui chơi đêm" },
  { "code": "sea",      "short": "Biển",       "full": "Biển & BBQ" },
  { "code": "camp",     "short": "Camping",    "full": "Camping & picnic" },
  { "code": "mountain", "short": "Leo núi",    "full": "Leo núi" },
  { "code": "park",     "short": "Công viên",  "full": "Công viên" },
  { "code": "viet",     "short": "Quán Việt",  "full": "Quán Việt" },
  { "code": "grocery",  "short": "Tạp hóa",   "full": "Tạp hoá Việt" },
  { "code": "izakaya",  "short": "Izakaya",    "full": "Quán nhậu Nhật" },
  { "code": "japanese", "short": "Quán Nhật",  "full": "Quán Nhật" },
  { "code": "thai",     "short": "Quán Thái",  "full": "Quán Thái" },
  { "code": "chinese",  "short": "Quán Trung", "full": "Quán Trung" },
  { "code": "korean",   "short": "Quán Hàn",   "full": "Quán Hàn" },
  { "code": "cafe_milk_tea",    "short": "Cà phê & trà sữa",       "full": "Cà phê & trà sữa" },
  { "code": "kids_playground", "short": "Khu vui chơi trẻ em",   "full": "Khu vui chơi dành cho bé" },
  { "code": "onsen",            "short": "Onsen",                  "full": "Onsen (suối nước nóng)" },
];

export const places: Place[] = [
  {
    "slug": "dazaifu-tenmangu",
    "name": "Dazaifu Tenmangu",
    "area": "Dazaifu",
    "desc": "Đền nổi tiếng, cầu may học hành, ăn umegae-mochi",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Dazaifu%20Tenmangu%20Shrine%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Dazaifu%20Tenmangu%20Shrine%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Dazaifu,Tenmangu,japan,landmark,temple?lock=1000",
    "imgFallback": "https://picsum.photos/seed/choco1000/680/460"
  },
  {
    "slug": "canal-city-hakata",
    "name": "Canal City Hakata",
    "area": "Hakata",
    "desc": "Shopping, ăn uống, xem nhạc nước",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Canal%20City%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Canal%20City%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Canal,City,Hakata,japan,landmark,temple?lock=1001",
    "imgFallback": "https://picsum.photos/seed/choco1001/680/460"
  },
  {
    "slug": "fukuoka-tower",
    "name": "Fukuoka Tower",
    "area": "Momochi",
    "desc": "Ngắm toàn cảnh thành phố và biển",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Fukuoka%20Tower%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Fukuoka%20Tower%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Fukuoka,Tower,japan,landmark,temple?lock=1002",
    "imgFallback": "https://picsum.photos/seed/choco1002/680/460"
  },
  {
    "slug": "ohori-park",
    "name": "Ohori Park",
    "area": "Chuo-ku",
    "desc": "Đi dạo, hẹn hò, chạy bộ, cafe",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ohori%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ohori%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Ohori,Park,japan,landmark,temple?lock=1003",
    "imgFallback": "https://picsum.photos/seed/choco1003/680/460"
  },
  {
    "slug": "maizuru-park-fukuoka-castle-ruins",
    "name": "Maizuru Park / Fukuoka Castle Ruins",
    "area": "Gần Ohori",
    "desc": "Ngắm hoa anh đào, đi bộ, chụp ảnh",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Maizuru%20Park%20Fukuoka%20Castle%20Ruins%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Maizuru%20Park%20Fukuoka%20Castle%20Ruins%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Maizuru,Park,Fukuoka,japan,landmark,temple?lock=1004",
    "imgFallback": "https://picsum.photos/seed/choco1004/680/460"
  },
  {
    "slug": "kushida-shrine",
    "name": "Kushida Shrine",
    "area": "Hakata",
    "desc": "Đền cổ, gần khu phố Hakata",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kushida%20Shrine%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kushida%20Shrine%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kushida,Shrine,japan,landmark,temple?lock=1005",
    "imgFallback": "https://picsum.photos/seed/choco1005/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Công viên rất rộng, đi xe đạp, picnic, gia đình",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,japan,landmark,temple?lock=1006",
    "imgFallback": "https://picsum.photos/seed/choco1006/680/460"
  },
  {
    "slug": "marine-world-uminonakamichi",
    "name": "Marine World Uminonakamichi",
    "area": "Higashi-ku",
    "desc": "Thủy cung, phù hợp đi chơi cuối tuần",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Marine%20World%20Uminonakamichi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Marine%20World%20Uminonakamichi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Marine,World,Uminonakamichi,japan,landmark,temple?lock=1007",
    "imgFallback": "https://picsum.photos/seed/choco1007/680/460"
  },
  {
    "slug": "mojiko-retro",
    "name": "Mojiko Retro",
    "area": "Kitakyushu",
    "desc": "Khu phố cổ, cảng biển, chụp ảnh đẹp",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mojiko%20Retro%20Kitakyushu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mojiko%20Retro%20Kitakyushu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mojiko,Retro,japan,landmark,temple?lock=1008",
    "imgFallback": "https://picsum.photos/seed/choco1008/680/460"
  },
  {
    "slug": "yanagawa",
    "name": "Yanagawa",
    "area": "Yanagawa",
    "desc": "Đi thuyền trên kênh, ăn lươn nướng unagi",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yanagawa%20boat%20ride%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yanagawa%20boat%20ride%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Yanagawa,japan,landmark,temple?lock=1009",
    "imgFallback": "https://picsum.photos/seed/choco1009/680/460"
  },
  {
    "slug": "nakasu-yatai",
    "name": "Nakasu Yatai",
    "area": "Tối",
    "desc": "Khu quầy ăn đêm nổi tiếng nhất Fukuoka",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nakasu%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nakasu%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1010",
    "imgFallback": "https://picsum.photos/seed/choco1010/680/460"
  },
  {
    "slug": "tenjin-yatai",
    "name": "Tenjin Yatai",
    "area": "Tối",
    "desc": "Dễ đi, nhiều quán, tiện sau giờ làm",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tenjin%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tenjin%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1011",
    "imgFallback": "https://picsum.photos/seed/choco1011/680/460"
  },
  {
    "slug": "nagahama-yatai",
    "name": "Nagahama Yatai",
    "area": "Tối",
    "desc": "Gần khu ramen Nagahama",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nagahama%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nagahama%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1012",
    "imgFallback": "https://picsum.photos/seed/choco1012/680/460"
  },
  {
    "slug": "hakata-station",
    "name": "Hakata Station",
    "area": "Trưa / Tối",
    "desc": "Nhiều nhà hàng, ramen, izakaya, tiện tàu",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Hakata%20Station%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Hakata%20Station%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1013",
    "imgFallback": "https://picsum.photos/seed/choco1013/680/460"
  },
  {
    "slug": "tenjin-daimyo",
    "name": "Tenjin / Daimyo",
    "area": "Tối",
    "desc": "Izakaya, bar, cafe, shopping",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Daimyo%20Tenjin%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Daimyo%20Tenjin%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1014",
    "imgFallback": "https://picsum.photos/seed/choco1014/680/460"
  },
  {
    "slug": "imaizumi-yakuin",
    "name": "Imaizumi / Yakuin",
    "area": "Tối",
    "desc": "Quán nhỏ, quán rượu, cafe đẹp",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yakuin%20Imaizumi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yakuin%20Imaizumi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1015",
    "imgFallback": "https://picsum.photos/seed/choco1015/680/460"
  },
  {
    "slug": "nakasu-kawabata",
    "name": "Nakasu Kawabata",
    "area": "Tối",
    "desc": "Ăn nhậu, nightlife, gần sông",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nakasu%20Kawabata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nakasu%20Kawabata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1016",
    "imgFallback": "https://picsum.photos/seed/choco1016/680/460"
  },
  {
    "slug": "momochi-seaside-park",
    "name": "Momochi Seaside Park",
    "area": "Gần Fukuoka Tower",
    "desc": "Dễ đi nhất trong city, ngắm biển, cafe",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Momochi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Momochi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Momochi,Seaside,Park,beach,sea,coast,japan?lock=1017",
    "imgFallback": "https://picsum.photos/seed/choco1017/680/460"
  },
  {
    "slug": "itoshima-futamigaura",
    "name": "Itoshima / Futamigaura",
    "area": "Itoshima",
    "desc": "Cổng torii trắng, đá đôi Meoto Iwa, hoàng hôn đẹp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Futamigaura%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Futamigaura%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Itoshima,Futamigaura,beach,sea,coast,japan?lock=1018",
    "imgFallback": "https://picsum.photos/seed/choco1018/680/460"
  },
  {
    "slug": "keya-beach",
    "name": "Keya Beach",
    "area": "Itoshima",
    "desc": "Biển đẹp, mùa hè đông vui (gửi xe có phí mùa hè)",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Keya%20Beach%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Keya%20Beach%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Keya,Beach,beach,sea,coast,japan?lock=1019",
    "imgFallback": "https://picsum.photos/seed/choco1019/680/460"
  },
  {
    "slug": "nogita-beach",
    "name": "Nogita Beach",
    "area": "Itoshima",
    "desc": "Cafe biển, lái xe đi rất chill",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nogita%20Beach%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nogita%20Beach%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nogita,Beach,beach,sea,coast,japan?lock=1020",
    "imgFallback": "https://picsum.photos/seed/choco1020/680/460"
  },
  {
    "slug": "shikanoshima",
    "name": "Shikanoshima",
    "area": "Higashi-ku",
    "desc": "Đảo gần thành phố, đi biển, đi xe đạp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shikanoshima,beach,sea,coast,japan?lock=1021",
    "imgFallback": "https://picsum.photos/seed/choco1021/680/460"
  },
  {
    "slug": "uminonakamichi-saitozaki",
    "name": "Uminonakamichi / Saitozaki",
    "area": "Higashi-ku",
    "desc": "Bãi Saitozaki free; công viên Uminonakamichi có phí",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Saitozaki%20Uminonakamichi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Saitozaki%20Uminonakamichi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Saitozaki,beach,sea,coast,japan?lock=1022",
    "imgFallback": "https://picsum.photos/seed/choco1022/680/460"
  },
  {
    "slug": "miyajihama-beach",
    "name": "Miyajihama Beach",
    "area": "Fukutsu",
    "desc": "Biển rộng, hoàng hôn đẹp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Miyajihama%20Beach%20Fukutsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Miyajihama%20Beach%20Fukutsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Miyajihama,Beach,beach,sea,coast,japan?lock=1023",
    "imgFallback": "https://picsum.photos/seed/choco1023/680/460"
  },
  {
    "slug": "fukuma-beach",
    "name": "Fukuma Beach",
    "area": "Fukutsu",
    "desc": "Biển đẹp, nhiều cafe ven biển",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Fukuma%20Beach%20Fukutsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Fukuma%20Beach%20Fukutsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Fukuma,Beach,beach,sea,coast,japan?lock=1024",
    "imgFallback": "https://picsum.photos/seed/choco1024/680/460"
  },
  {
    "slug": "kanezakihama",
    "name": "Kanezakihama",
    "area": "Munakata",
    "desc": "Biển, surf, không khí thoáng",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kanezaki%20Beach%20Munakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kanezaki%20Beach%20Munakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kanezakihama,beach,sea,coast,japan?lock=1025",
    "imgFallback": "https://picsum.photos/seed/choco1025/680/460"
  },
  {
    "slug": "nata-beach",
    "name": "奈多海岸 / Nata Beach",
    "area": "Higashi-ku",
    "desc": "Biển gần city, picnic/BBQ tùy khu & mùa",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E5%A5%88%E5%A4%9A%E6%B5%B7%E5%B2%B8%20Nata%20Beach%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E5%A5%88%E5%A4%9A%E6%B5%B7%E5%B2%B8%20Nata%20Beach%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nata,Beach,beach,sea,coast,japan?lock=1026",
    "imgFallback": "https://picsum.photos/seed/choco1026/680/460"
  },
  {
    "slug": "shingu-beach",
    "name": "Shingu Beach / 新宮海岸",
    "area": "Shingu-machi",
    "desc": "Bãi rộng, đẹp, hợp tắm biển và BBQ (gửi xe có phí mùa hè)",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E5%AE%AE%E6%B5%B7%E6%B0%B4%E6%B5%B4%E5%A0%B4%20Shingu%20Beach%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E5%AE%AE%E6%B5%B7%E6%B0%B4%E6%B5%B4%E5%A0%B4%20Shingu%20Beach%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shingu,Beach,beach,sea,coast,japan?lock=1027",
    "imgFallback": "https://picsum.photos/seed/choco1027/680/460"
  },
  {
    "slug": "camp-umi-machi-gan-dazaifu",
    "name": "一本松公園 (昭和の森)",
    "area": "Umi-machi · gần Dazaifu",
    "desc": "Camping, BBQ, picnic, chơi suối, leo núi. Cắm trại & BBQ free, gửi xe ¥500 vào mùa hè",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%98%AD%E5%92%8C%E3%81%AE%E6%A3%AE%20%E4%B8%80%E6%9C%AC%E6%9D%BE%E5%85%AC%E5%9C%92%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%98%AD%E5%92%8C%E3%81%AE%E6%A3%AE%20%E4%B8%80%E6%9C%AC%E6%9D%BE%E5%85%AC%E5%9C%92%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "img": "https://loremflickr.com/680/460/camping,bbq,outdoor,nature?lock=1028",
    "imgFallback": "https://picsum.photos/seed/choco1028/680/460"
  },
  {
    "slug": "aburayama-fukuoka",
    "name": "ABURAYAMA FUKUOKA",
    "area": "Minami-ku",
    "desc": "Gần city, picnic, BBQ, đi bộ thiên nhiên (có thể tốn phí gửi xe)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Aburayama%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Aburayama%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/ABURAYAMA,FUKUOKA,camping,bbq,outdoor,nature?lock=1029",
    "imgFallback": "https://picsum.photos/seed/choco1029/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park-2",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Picnic, đi xe đạp, gia đình. Vào cửa ¥450 (≤ THCS miễn phí)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,camping,bbq,outdoor,nature?lock=1030",
    "imgFallback": "https://picsum.photos/seed/choco1030/680/460"
  },
  {
    "slug": "nokonoshima-island-park",
    "name": "Nokonoshima Island Park",
    "area": "Đảo Nokonoshima",
    "desc": "Hoa, picnic, view biển. Vào cửa ¥1.500 + vé phà",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nokonoshima%20Island%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nokonoshima%20Island%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nokonoshima,Island,Park,camping,bbq,outdoor,nature?lock=1031",
    "imgFallback": "https://picsum.photos/seed/choco1031/680/460"
  },
  {
    "slug": "itoshima-area",
    "name": "Itoshima area",
    "area": "Itoshima",
    "desc": "Biển, BBQ, camping, cafe. Biển free; khu cắm trại tùy nơi",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Itoshima,area,camping,bbq,outdoor,nature?lock=1032",
    "imgFallback": "https://picsum.photos/seed/choco1032/680/460"
  },
  {
    "slug": "shikanoshima-2",
    "name": "Shikanoshima",
    "area": "Higashi-ku",
    "desc": "Đi biển, camping nhẹ, lái xe. Bãi biển free",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shikanoshima,camping,bbq,outdoor,nature?lock=1033",
    "imgFallback": "https://picsum.photos/seed/choco1033/680/460"
  },
  {
    "slug": "hoshinofurusato-park",
    "name": "Hoshinofurusato Park",
    "area": "Yame",
    "desc": "Camping, ngắm sao, thiên nhiên. Khu cắm trại có phí",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Hoshino%20Furusato%20Park%20Yame%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Hoshino%20Furusato%20Park%20Yame%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Hoshinofurusato,Park,camping,bbq,outdoor,nature?lock=1034",
    "imgFallback": "https://picsum.photos/seed/choco1034/680/460"
  },
  {
    "slug": "greenpia-yame",
    "name": "Greenpia Yame",
    "area": "Yame",
    "desc": "Camping, resort, gia đình (onsen, cottage có phí)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Greenpia%20Yame%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Greenpia%20Yame%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Greenpia,Yame,camping,bbq,outdoor,nature?lock=1035",
    "imgFallback": "https://picsum.photos/seed/choco1035/680/460"
  },
  {
    "slug": "kyushu-geibunkan-chikugo",
    "name": "Kyushu Geibunkan / Chikugo",
    "area": "Chikugo",
    "desc": "Picnic, đi chơi xa nhẹ. Vào cửa khu chính miễn phí",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kyushu%20Geibunkan%20Chikugo%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kyushu%20Geibunkan%20Chikugo%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kyushu,Geibunkan,Chikugo,camping,bbq,outdoor,nature?lock=1036",
    "imgFallback": "https://picsum.photos/seed/choco1036/680/460"
  },
  {
    "slug": "mount-homan",
    "name": "Mount Homan (宝満山)",
    "area": "Trung bình · rất nổi tiếng",
    "desc": "Đỉnh núi nổi tiếng nhất vùng Dazaifu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Homan%20Dazaifu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Homan%20Dazaifu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Homan,mountain,hiking,forest?lock=1037",
    "imgFallback": "https://picsum.photos/seed/choco1037/680/460"
  },
  {
    "slug": "mount-tenpaizan",
    "name": "Mount Tenpaizan (天拝山)",
    "area": "Dễ · hợp người mới",
    "desc": "Leo nhẹ nhàng, lý tưởng cho người mới bắt đầu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Tenpaizan%20Chikushino%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Tenpaizan%20Chikushino%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Tenpaizan,mountain,hiking,forest?lock=1038",
    "imgFallback": "https://picsum.photos/seed/choco1038/680/460"
  },
  {
    "slug": "mount-aburayama",
    "name": "Mount Aburayama (油山)",
    "area": "Dễ–TB · gần thành phố",
    "desc": "Gần Fukuoka city, dễ tiếp cận",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Aburayama%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Aburayama%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Aburayama,mountain,hiking,forest?lock=1039",
    "imgFallback": "https://picsum.photos/seed/choco1039/680/460"
  },
  {
    "slug": "mount-sefuri",
    "name": "Mount Sefuri (背振山)",
    "area": "Trung bình · thiên nhiên đẹp",
    "desc": "Ranh giới Fukuoka–Saga, cảnh đẹp",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Sefuri%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Sefuri%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Sefuri,mountain,hiking,forest?lock=1040",
    "imgFallback": "https://picsum.photos/seed/choco1040/680/460"
  },
  {
    "slug": "mount-raizan",
    "name": "Mount Raizan (雷山)",
    "area": "Trung bình · mùa lá đỏ",
    "desc": "Itoshima, đẹp nhất mùa lá đỏ",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Raizan%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Raizan%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Raizan,mountain,hiking,forest?lock=1041",
    "imgFallback": "https://picsum.photos/seed/choco1041/680/460"
  },
  {
    "slug": "mount-tachibana",
    "name": "Mount Tachibana (立花山)",
    "area": "Dễ–TB",
    "desc": "Higashi-ku, đường mòn dễ chịu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Tachibana%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Tachibana%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Tachibana,mountain,hiking,forest?lock=1042",
    "imgFallback": "https://picsum.photos/seed/choco1042/680/460"
  },
  {
    "slug": "mount-kaya",
    "name": "Mount Kaya (可也山)",
    "area": "Trung bình · view biển",
    "desc": "Nhìn ra biển Itoshima",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Kaya%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Kaya%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Kaya,mountain,hiking,forest?lock=1043",
    "imgFallback": "https://picsum.photos/seed/choco1043/680/460"
  },
  {
    "slug": "sarakurayama",
    "name": "Sarakurayama (皿倉山)",
    "area": "Có cáp treo · ngắm đêm",
    "desc": "View đêm tuyệt đẹp ở Kitakyushu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Sarakurayama%20Kitakyushu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Sarakurayama%20Kitakyushu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Sarakurayama,mountain,hiking,forest?lock=1044",
    "imgFallback": "https://picsum.photos/seed/choco1044/680/460"
  },
  {
    "slug": "ohori-park-2",
    "name": "Ohori Park",
    "area": "Chuo-ku",
    "desc": "Hồ lớn, đi dạo, chạy bộ, cafe",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ohori%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ohori%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Ohori,Park,park,garden,flowers?lock=1045",
    "imgFallback": "https://picsum.photos/seed/choco1045/680/460"
  },
  {
    "slug": "maizuru-park",
    "name": "Maizuru Park",
    "area": "Chuo-ku",
    "desc": "Di tích thành Fukuoka, hoa anh đào",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Maizuru%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Maizuru%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Maizuru,Park,park,garden,flowers?lock=1046",
    "imgFallback": "https://picsum.photos/seed/choco1046/680/460"
  },
  {
    "slug": "nishi-park",
    "name": "Nishi Park",
    "area": "Chuo-ku",
    "desc": "Hoa anh đào, view biển / thành phố",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nishi%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nishi%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nishi,Park,park,garden,flowers?lock=1047",
    "imgFallback": "https://picsum.photos/seed/choco1047/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park-3",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Rất rộng, hoa, xe đạp, gia đình",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,park,garden,flowers?lock=1048",
    "imgFallback": "https://picsum.photos/seed/choco1048/680/460"
  },
  {
    "slug": "nokonoshima-island-park-2",
    "name": "Nokonoshima Island Park",
    "area": "Nokonoshima",
    "desc": "Hoa theo mùa, view biển",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nokonoshima%20Island%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nokonoshima%20Island%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nokonoshima,Island,Park,park,garden,flowers?lock=1049",
    "imgFallback": "https://picsum.photos/seed/choco1049/680/460"
  },
  {
    "slug": "island-city-central-park",
    "name": "Island City Central Park",
    "area": "Higashi-ku",
    "desc": "Hiện đại, rộng, hợp gia đình",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Island%20City%20Central%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Island%20City%20Central%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Island,City,Central,park,garden,flowers?lock=1050",
    "imgFallback": "https://picsum.photos/seed/choco1050/680/460"
  },
  {
    "slug": "yusentei-park",
    "name": "Yusentei Park",
    "area": "Jonan-ku",
    "desc": "Vườn Nhật yên tĩnh",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yusentei%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yusentei%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Yusentei,Park,park,garden,flowers?lock=1051",
    "imgFallback": "https://picsum.photos/seed/choco1051/680/460"
  },
  {
    "slug": "katsuma-seaside-park",
    "name": "Katsuma Seaside Park",
    "area": "Shikanoshima",
    "desc": "Biển và công viên",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Katsuma%20Beach%20Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Katsuma%20Beach%20Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Katsuma,Seaside,Park,park,garden,flowers?lock=1052",
    "imgFallback": "https://picsum.photos/seed/choco1052/680/460"
  },
  {
    "slug": "tre-xanh",
    "name": "Tre Xanh / チェーサイン",
    "area": "Hakata",
    "desc": "Quán Việt nổi tiếng gần Hakata (có cơ sở gần 博多駅東 & 博多駅前)",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tre%20Xanh%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tre%20Xanh%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1053",
    "imgFallback": "https://picsum.photos/seed/choco1053/680/460"
  },
  {
    "slug": "tre-xanh-2-2",
    "name": "Tre Xanh 2 / チェーサイン2号",
    "area": "Hakata Ekimae",
    "desc": "Gần Hakata Ekimae, hợp đi ăn nhóm",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tre%20Xanh%202%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tre%20Xanh%202%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1054",
    "imgFallback": "https://picsum.photos/seed/choco1054/680/460"
  },
  {
    "slug": "ga-sai-gon",
    "name": "Gà Sài Gòn / ガーサイゴン",
    "area": "Hakata Ekimae",
    "desc": "Quán Việt khu Hakata Ekimae",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ga%20Sai%20Gon%20%E3%82%AC%E3%83%BC%E3%82%B5%E3%82%A4%E3%82%B4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ga%20Sai%20Gon%20%E3%82%AC%E3%83%BC%E3%82%B5%E3%82%A4%E3%82%B4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1055",
    "imgFallback": "https://picsum.photos/seed/choco1055/680/460"
  },
  {
    "slug": "au-viet-restaurant",
    "name": "Âu Việt Restaurant",
    "area": "Higashi-Hie",
    "desc": "Khu Higashi-Hie, gần Hakata",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Au%20Viet%20Restaurant%20Higashi-Hie%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Au%20Viet%20Restaurant%20Higashi-Hie%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1056",
    "imgFallback": "https://picsum.photos/seed/choco1056/680/460"
  },
  {
    "slug": "lotus-palace-hakata",
    "name": "Lotus Palace Hakata",
    "area": "Hakata",
    "desc": "Dễ đi từ ga Hakata, hợp đi với người Nhật",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Lotus%20Palace%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Lotus%20Palace%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1057",
    "imgFallback": "https://picsum.photos/seed/choco1057/680/460"
  },
  {
    "slug": "ban-mai",
    "name": "Ban Mai / バンマイ",
    "area": "Hakata / Higashi-Hie",
    "desc": "Quán Việt khu Hakata / Higashi-Hie",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ban%20Mai%20%E3%83%90%E3%83%B3%E3%83%9E%E3%82%A4%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ban%20Mai%20%E3%83%90%E3%83%B3%E3%83%9E%E3%82%A4%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1058",
    "imgFallback": "https://picsum.photos/seed/choco1058/680/460"
  },
  {
    "slug": "vietnamese-cuisine",
    "name": "VIETNAMESE CUISINE",
    "area": "Nakasu",
    "desc": "Khu Nakasu / Nakasu-Kawabata, gần trung tâm",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Vietnamese%20Cuisine%20Nakasu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Vietnamese%20Cuisine%20Nakasu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1059",
    "imgFallback": "https://picsum.photos/seed/choco1059/680/460"
  },
  {
    "slug": "39",
    "name": "39 ベトナム料理",
    "area": "Ohashi",
    "desc": "Quán Việt ở Ohashi",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=39%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%E6%96%99%E7%90%86%20Ohashi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=39%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%E6%96%99%E7%90%86%20Ohashi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1060",
    "imgFallback": "https://picsum.photos/seed/choco1060/680/460"
  },
  {
    "slug": "goc-viet",
    "name": "Góc Việt / ゴックベト",
    "area": "Ohashi",
    "desc": "Quán Việt khu Ohashi",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Goc%20Viet%20%E3%82%B4%E3%83%83%E3%82%AF%E3%83%99%E3%83%88%20Ohashi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Goc%20Viet%20%E3%82%B4%E3%83%83%E3%82%AF%E3%83%99%E3%83%88%20Ohashi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1061",
    "imgFallback": "https://picsum.photos/seed/choco1061/680/460"
  },
  {
    "slug": "lotus-palace-daimyo-garden-city",
    "name": "Lotus Palace Daimyo Garden City",
    "area": "Daimyo / Tenjin",
    "desc": "Vị trí đẹp ngay khu Daimyo",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Lotus%20Palace%20Daimyo%20Garden%20City%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Lotus%20Palace%20Daimyo%20Garden%20City%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1062",
    "imgFallback": "https://picsum.photos/seed/choco1062/680/460"
  },
  {
    "slug": "xin-chao",
    "name": "Xin Chao / シンチャオ",
    "area": "Ropponmatsu",
    "desc": "Quán Việt khu Ropponmatsu",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Xin%20Chao%20%E3%82%B7%E3%83%B3%E3%83%81%E3%83%A3%E3%82%AA%20Ropponmatsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Xin%20Chao%20%E3%82%B7%E3%83%B3%E3%83%81%E3%83%A3%E3%82%AA%20Ropponmatsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1063",
    "imgFallback": "https://picsum.photos/seed/choco1063/680/460"
  },
  {
    "slug": "vietnam-bistro-asiatico",
    "name": "Vietnam Bistro Asiatico",
    "area": "Tenjin",
    "desc": "Quán Việt / châu Á",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Vietnam%20Bistro%20Asiatico%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Vietnam%20Bistro%20Asiatico%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1064",
    "imgFallback": "https://picsum.photos/seed/choco1064/680/460"
  },
  {
    "slug": "miss-saigon",
    "name": "Miss Saigon",
    "area": "Tenjin",
    "desc": "Quán Việt",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Miss%20Saigon%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Miss%20Saigon%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1065",
    "imgFallback": "https://picsum.photos/seed/choco1065/680/460"
  },
  {
    "slug": "hsc-station-cho-viet",
    "name": "HSC STATION / Chợ Việt",
    "area": "Hakozaki · Hakata · Shingu",
    "desc": "Cửa hàng Việt nổi trong cộng đồng",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=HSC%20STATION%20Cho%20Viet%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=HSC%20STATION%20Cho%20Viet%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1066",
    "imgFallback": "https://picsum.photos/seed/choco1066/680/460"
  },
  {
    "slug": "tam-market",
    "name": "TAM MARKET",
    "area": "Fukuoka",
    "desc": "Tạp hóa Việt Nam (tìm: TAM MARKET 福岡)",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=TAM%20MARKET%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=TAM%20MARKET%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1067",
    "imgFallback": "https://picsum.photos/seed/choco1067/680/460"
  },
  {
    "slug": "asia-no-eki",
    "name": "Asia no Eki / アジアの駅",
    "area": "Chiyo · Hakata-ku",
    "desc": "Thực phẩm châu Á, có hàng Việt",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%82%A2%E3%82%B8%E3%82%A2%E3%81%AE%E9%A7%85%20Chiyo%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%82%A2%E3%82%B8%E3%82%A2%E3%81%AE%E9%A7%85%20Chiyo%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1068",
    "imgFallback": "https://picsum.photos/seed/choco1068/680/460"
  },
  {
    "slug": "ahihi",
    "name": "Ahihi / あひひ",
    "area": "Fukuoka",
    "desc": "Hàng Việt được cộng đồng biết đến",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%81%82%E3%81%B2%E3%81%B2%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%81%82%E3%81%B2%E3%81%B2%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1069",
    "imgFallback": "https://picsum.photos/seed/choco1069/680/460"
  },
  {
    "slug": "bach-hoa-akt-akt-store",
    "name": "Bách Hóa AKT / AKT STORE",
    "area": "Fukuoka",
    "desc": "Tạp hóa Việt Nam",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=AKT%20STORE%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=AKT%20STORE%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1070",
    "imgFallback": "https://picsum.photos/seed/choco1070/680/460"
  },
  {
    "slug": "sk",
    "name": "SK 中越物産",
    "area": "Hakata / Higashi-Hie",
    "desc": "Bán hàng Việt và châu Á",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=SK%20%E4%B8%AD%E8%B6%8A%E7%89%A9%E7%94%A3%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=SK%20%E4%B8%AD%E8%B6%8A%E7%89%A9%E7%94%A3%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1071",
    "imgFallback": "https://picsum.photos/seed/choco1071/680/460"
  },
  {
    "slug": "vinahouse",
    "name": "Vinahouse / ビナハウス",
    "area": "Tojinmachi",
    "desc": "Gần Ohori, bán thực phẩm Việt",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%83%93%E3%83%8A%E3%83%8F%E3%82%A6%E3%82%B9%20%E5%94%90%E4%BA%BA%E7%94%BA%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%83%93%E3%83%8A%E3%83%8F%E3%82%A6%E3%82%B9%20%E5%94%90%E4%BA%BA%E7%94%BA%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1072",
    "imgFallback": "https://picsum.photos/seed/choco1072/680/460"
  },
  {
    "slug": "san-pham-viet-fukuoka",
    "name": "Sản Phẩm Việt Fukuoka",
    "area": "Fukuoka",
    "desc": "Bán hàng Việt (thường thấy trên Facebook)",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=San%20Pham%20Viet%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=San%20Pham%20Viet%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1073",
    "imgFallback": "https://picsum.photos/seed/choco1073/680/460"
  },
  {
    "slug": "izakaya-hakata",
    "name": "新時代 博多駅前店",
    "area": "Hakata · 博多口",
    "desc": "Gần phía Hakata Station mặt trước",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E5%89%8D%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E5%89%8D%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1074",
    "imgFallback": "https://picsum.photos/seed/choco1074/680/460"
  },
  {
    "slug": "izakaya-fko",
    "name": "新時代 博多駅東店",
    "area": "筑紫口 · 駅東",
    "desc": "Gần phía mặt sau ga Hakata",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E6%9D%B1%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E6%9D%B1%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1075",
    "imgFallback": "https://picsum.photos/seed/choco1075/680/460"
  },
  {
    "slug": "izakaya-tenjin-imaizumi",
    "name": "新時代 福岡天神店",
    "area": "Tenjin · Imaizumi",
    "desc": "Gần khu Tenjin, dễ đi nhậu sau giờ làm",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E7%A6%8F%E5%B2%A1%E5%A4%A9%E7%A5%9E%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E7%A6%8F%E5%B2%A1%E5%A4%A9%E7%A5%9E%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1076",
    "imgFallback": "https://picsum.photos/seed/choco1076/680/460"
  }
];

export function getPlace(slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
export function placesByCategory(code: string): Place[] {
  return places.filter((p) => p.category === code);
}
export function relatedPlaces(p: Place, n = 3): Place[] {
  return places.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, n);
}

// ── Place translation types ───────────────────────────────────────────────────

export interface PlaceTranslation {
  place_slug: string
  locale: string
  area: string | null
  short_description: string | null
  content: string | null
  translation_status: string
}

// Merge a translation into a Place (overrides area, desc, body if present)
export function applyPlaceTranslation(place: Place, t: PlaceTranslation | null | undefined): Place {
  if (!t) return place
  return {
    ...place,
    area: t.area ?? place.area,
    desc: t.short_description ?? place.desc,
    body: t.content || place.body,
  }
}

// ── Supabase DB helpers ───────────────────────────────────────────────────────

interface DbPlace {
  slug: string; name: string; area: string; description: string | null;
  body: string | null; category: string; category_label: string;
  fee: string | null; map_url: string | null; photo_url: string | null;
  img: string | null; img_fallback: string | null; sort_order: number;
  status?: string | null; user_id?: string | null;
  region?: string | null; prefecture?: string | null; city?: string | null;
  address?: string | null;
  lat?: number | null; lng?: number | null;
  // ── Map UX Phase 4: provider provenance + coordinate audit (all optional;
  //    missing column → undefined → null, so old/pre-migration rows are fine) ──
  location_provider?: string | null; provider_place_id?: string | null;
  provider_formatted_address?: string | null; provider_maps_url?: string | null;
  provider_data_updated_at?: string | null; country_code?: string | null;
  location_source?: string | null; location_manually_adjusted?: boolean | null;
  location_confirmed_at?: string | null; location_confirmed_by?: string | null;
  area_main?: string | null; nearby_place?: string | null;
  city_or_prefecture?: string | null; relation_type?: string | null;
  // Explore Phase 1 (all optional; missing column → undefined → null)
  subcategories?: string[] | null; postal_code?: string | null;
  nearest_station?: string | null; station_walk_minutes?: number | null;
  price_type?: string | null; price_min?: number | null; price_max?: number | null; currency?: string | null;
  opening_hours?: Record<string, unknown> | null; closed_days?: string[] | null; temporary_status?: string | null;
  reservation_recommended?: boolean | null; reservation_required?: boolean | null; walk_ins_accepted?: boolean | null;
  good_for_children?: boolean | null; good_for_solo?: boolean | null; good_for_groups?: boolean | null;
  parking?: string | null; indoor_outdoor?: string | null; rainy_day_ok?: boolean | null;
  wheelchair_accessible?: boolean | null; smoking_policy?: string | null;
  payment_methods?: string[] | null; supported_languages?: string[] | null;
  tattoo_policy?: string | null; bbq_available?: boolean | null; camping_available?: boolean | null; pet_policy?: string | null;
  official_website?: string | null; reservation_url?: string | null; reservation_provider?: string | null;
  phone?: string | null; phone_e164?: string | null; social_url?: string | null; source_url?: string | null; last_verified_at?: string | null;
  know_before_you_go?: string | null; vi_tips?: string | null; items_to_bring?: string[] | null;
  recommended_duration_minutes?: number | null; best_visit_time?: string | null; expected_crowd_level?: string | null;
  japanese_phrases?: { ja: string; romaji: string; vi: string }[] | null; verification_status?: string | null;
  search_eligible?: boolean | null; recommend_eligible?: boolean | null;
  created_at?: string | null; updated_at?: string | null;
}

function mapDbPlace(row: DbPlace): Place {
  return {
    slug: row.slug,
    name: row.name,
    area: row.area,
    desc: row.description ?? '',
    body: row.body,
    category: row.category,
    categoryLabel: row.category_label,
    fee: (row.fee as Fee) ?? null,
    mapUrl: row.map_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name + ' Fukuoka')}`,
    photoUrl: row.photo_url ?? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(row.name)}`,
    img: row.img ?? `https://loremflickr.com/680/460/${row.category},japan?lock=${row.slug.charCodeAt(0) * 99}`,
    imgFallback: row.img_fallback ?? `https://picsum.photos/seed/${row.slug.slice(0, 8)}/680/460`,
    region: row.region ?? 'kyushu',
    prefecture: row.prefecture ?? 'fukuoka',
    city: row.city ?? null,
    address: row.address ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    // ── Phase 4 location provenance/audit (null when column absent) ──
    locationProvider: row.location_provider ?? null,
    providerPlaceId: row.provider_place_id ?? null,
    providerFormattedAddress: row.provider_formatted_address ?? null,
    providerMapsUrl: row.provider_maps_url ?? null,
    providerDataUpdatedAt: row.provider_data_updated_at ?? null,
    countryCode: row.country_code ?? null,
    locationSource: row.location_source ?? null,
    locationManuallyAdjusted: row.location_manually_adjusted ?? null,
    locationConfirmedAt: row.location_confirmed_at ?? null,
    locationConfirmedBy: row.location_confirmed_by ?? null,
    areaMain: row.area_main ?? null,
    nearbyPlace: row.nearby_place ?? null,
    cityOrPrefecture: row.city_or_prefecture ?? null,
    relationType: (row.relation_type as RelationType | null) ?? null,
    // ── Explore Phase 1 structured fields ──
    subcategories: row.subcategories ?? null,
    postalCode: row.postal_code ?? null,
    nearestStation: row.nearest_station ?? null,
    stationWalkMinutes: row.station_walk_minutes ?? null,
    priceType: (row.price_type as Place['priceType']) ?? null,
    priceMin: row.price_min ?? null,
    priceMax: row.price_max ?? null,
    currency: row.currency ?? null,
    openingHours: row.opening_hours ?? null,
    closedDays: row.closed_days ?? null,
    temporaryStatus: (row.temporary_status as Place['temporaryStatus']) ?? null,
    reservationRecommended: row.reservation_recommended ?? null,
    reservationRequired: row.reservation_required ?? null,
    walkInsAccepted: row.walk_ins_accepted ?? null,
    goodForChildren: row.good_for_children ?? null,
    goodForSolo: row.good_for_solo ?? null,
    goodForGroups: row.good_for_groups ?? null,
    parking: row.parking ?? null,
    indoorOutdoor: row.indoor_outdoor ?? null,
    rainyDayOk: row.rainy_day_ok ?? null,
    wheelchairAccessible: row.wheelchair_accessible ?? null,
    smokingPolicy: row.smoking_policy ?? null,
    paymentMethods: row.payment_methods ?? null,
    supportedLanguages: row.supported_languages ?? null,
    tattooPolicy: row.tattoo_policy ?? null,
    bbqAvailable: row.bbq_available ?? null,
    campingAvailable: row.camping_available ?? null,
    petPolicy: row.pet_policy ?? null,
    officialWebsite: row.official_website ?? null,
    reservationUrl: row.reservation_url ?? null,
    reservationProvider: row.reservation_provider ?? null,
    phone: row.phone ?? null,
    phoneE164: row.phone_e164 ?? null,
    socialUrl: row.social_url ?? null,
    sourceUrl: row.source_url ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
    knowBeforeYouGo: row.know_before_you_go ?? null,
    viTips: row.vi_tips ?? null,
    itemsToBring: row.items_to_bring ?? null,
    recommendedDurationMinutes: row.recommended_duration_minutes ?? null,
    bestVisitTime: row.best_visit_time ?? null,
    expectedCrowdLevel: row.expected_crowd_level ?? null,
    japanesePhrases: row.japanese_phrases ?? null,
    verificationStatus: row.verification_status ?? null,
    searchEligible: row.search_eligible ?? null,
    recommendEligible: row.recommend_eligible ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// Fetch all published translations for a given locale (bulk, for list pages)
async function fetchTranslationsForLocale(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  locale: string,
): Promise<Map<string, PlaceTranslation>> {
  const map = new Map<string, PlaceTranslation>()
  try {
    const { data } = await supabase
      .from('place_translations')
      .select('place_slug,locale,area,short_description,content,translation_status')
      .eq('locale', locale)
      .eq('translation_status', 'published')
    for (const row of (data ?? []) as PlaceTranslation[]) {
      map.set(row.place_slug, row)
    }
  } catch { /* table may not exist yet */ }
  return map
}

/**
 * Enrich a list of places with their tag names+slugs (for card display & search).
 * Best-effort: returns the input unchanged on any error or before the tags
 * migration is applied. Uses the cookie-free public client (cache-safe).
 */
export async function attachPlaceTags(list: Place[]): Promise<Place[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !list.length) return list;
  try {
    const { createPublicClient } = await import('@/lib/supabase/public');
    const { getTagsForContents } = await import('@/lib/tags');
    const sb = createPublicClient();
    const slugs = list.map((p) => p.slug);
    const { data } = await sb.from('places').select('id, slug').in('slug', slugs);
    const rows = (data ?? []) as { id: string; slug: string }[];
    if (!rows.length) return list;
    const idToSlug = new Map(rows.map((r) => [r.id, r.slug]));
    const tagMap = await getTagsForContents(sb, 'place', rows.map((r) => r.id));
    const slugToTags = new Map<string, LocalizedTag[]>();
    for (const [id, tags] of Array.from(tagMap.entries())) {
      const slug = idToSlug.get(id);
      if (slug && tags.length) slugToTags.set(slug, tags);
    }
    if (!slugToTags.size) return list;
    return list.map((p) => (slugToTags.has(p.slug) ? { ...p, tags: slugToTags.get(p.slug) } : p));
  } catch {
    return list;
  }
}

/**
 * Attach a community-activity score (ratings + approved comments count) to each
 * place — used by the "community activity" sort. Best-effort; returns the input
 * unchanged on any error. Cache-safe public client.
 */
export async function attachCommunityActivity(list: Place[]): Promise<Place[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !list.length) return list;
  try {
    const { createPublicClient } = await import('@/lib/supabase/public');
    const sb = createPublicClient();
    const slugs = list.map((p) => p.slug);
    const counts = new Map<string, number>();
    const [{ data: r }, { data: c }] = await Promise.all([
      sb.from('place_ratings').select('place_slug').in('place_slug', slugs),
      sb.from('place_comments').select('place_slug').eq('status', 'approved').in('place_slug', slugs),
    ]);
    for (const row of (r ?? []) as { place_slug: string }[]) counts.set(row.place_slug, (counts.get(row.place_slug) ?? 0) + 1);
    for (const row of (c ?? []) as { place_slug: string }[]) counts.set(row.place_slug, (counts.get(row.place_slug) ?? 0) + 1);
    if (!counts.size) return list;
    return list.map((p) => (counts.has(p.slug) ? { ...p, communityActivity: counts.get(p.slug) } : p));
  } catch {
    return list;
  }
}

export async function getAllPlacesFromDb(locale?: string): Promise<Place[] | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data?.length) return null;
    const rows = (data as DbPlace[]).filter((r) => r.status !== 'pending');
    const places = rows.map(mapDbPlace)
    // Apply translations when a non-default locale is requested
    if (locale && locale !== 'vi') {
      const txMap = await fetchTranslationsForLocale(supabase, locale)
      return places.map(p => applyPlaceTranslation(p, txMap.get(p.slug)))
    }
    return places
  } catch { return null; }
}

export async function getPlaceFromDb(slug: string, locale?: string): Promise<Place | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error || !data) return null;
    const place = mapDbPlace(data as DbPlace)
    if (locale && locale !== 'vi') {
      // Fetch the specific translation for this place + locale
      try {
        const { data: tx } = await supabase
          .from('place_translations')
          .select('place_slug,locale,area,short_description,content,translation_status')
          .eq('place_slug', slug)
          .eq('locale', locale)
          .eq('translation_status', 'published')
          .maybeSingle()
        return applyPlaceTranslation(place, tx as PlaceTranslation | null)
      } catch { return place }
    }
    return place
  } catch { return null; }
}

// ── Bình luận & đánh giá địa điểm ─────────────────────────────
export interface PlaceComment {
  id: string;
  place_slug: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

export async function getPlaceComments(slug: string): Promise<PlaceComment[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !slug) return [];
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    // Post-Phase-6: only plain comments (questions/answers render in PlaceQuestions).
    const withKind = await admin
      .from('place_comments_with_author')
      .select('id, place_slug, user_id, content, created_at, author_name, author_avatar')
      .eq('place_slug', slug)
      .eq('status', 'approved')
      .eq('kind', 'comment')
      .order('created_at', { ascending: true });
    if (!withKind.error && withKind.data) return withKind.data as PlaceComment[];
    // Pre-migration fallback (no `kind` column yet) — preserve existing behavior.
    const { data } = await admin
      .from('place_comments_with_author')
      .select('id, place_slug, user_id, content, created_at, author_name, author_avatar')
      .eq('place_slug', slug)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    return (data ?? []) as PlaceComment[];
  } catch {
    return [];
  }
}

export type PlaceRating = { average: number; count: number; myStars: number | null; myReview: string | null };

export async function getPlaceRating(slug: string, viewerId?: string | null): Promise<PlaceRating> {
  const empty: PlaceRating = { average: 0, count: 0, myStars: null, myReview: null };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !slug) return empty;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { data } = await admin
      .from('place_ratings')
      .select('stars, review, user_id')
      .eq('place_slug', slug);
    const rows = (data ?? []) as { stars: number; review: string | null; user_id: string }[];
    const count = rows.length;
    const average = count ? rows.reduce((s, r) => s + r.stars, 0) / count : 0;
    const mine = viewerId ? rows.find((r) => r.user_id === viewerId) : undefined;
    return { average, count, myStars: mine?.stars ?? null, myReview: mine?.review ?? null };
  } catch {
    return empty;
  }
}

// Get all translations for a place slug (for admin UI)
export async function getPlaceAllTranslations(slug: string): Promise<PlaceTranslation[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data } = await admin
      .from('place_translations')
      .select('place_slug,locale,area,short_description,content,translation_status')
      .eq('place_slug', slug)
      .order('locale')
    return (data ?? []) as PlaceTranslation[]
  } catch { return [] }
}
