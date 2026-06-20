import type { Place, Fee } from './places';

// ============================================================
// Lớp trừu tượng tìm kiếm địa điểm (config-driven, boundary-aware).
//
// HÔM NAY: lọc in-memory trên mảng đã tải sẵn (tức thì, không gọi mạng).
// TƯƠNG LAI (hàng nghìn địa điểm): đổi RUỘT filterPlaces() thành truy vấn Supabase
// (full-text + phân trang) — UI gọi cùng chữ ký nên KHÔNG phải sửa.
//
// BỐN KHÁI NIỆM TÁCH BẠCH (không nhồi chung 1 object synonym):
//   A. Editorial category  — tổ chức/hiển thị; membership KHÔNG chứng minh từng
//      tính năng trong tên category gộp ("Biển & BBQ", "Camping & picnic").
//   B. Feature facet       — BBQ / camping / picnic / nightlife… cần BẰNG CHỨNG
//      cấp item (structured field / tag / tên / mô tả). Không suy từ category.
//   C. Tag & amenity       — mô tả từng địa điểm; dùng làm bằng chứng có cấu trúc.
//   D. Search alias        — ánh xạ nhiều cách viết / ngôn ngữ về cùng 1 khái niệm.
//
// Toàn bộ A–D nằm trong SearchConfig (DEFAULT_SEARCH_CONFIG dưới đây là cấu hình
// mặc định; loadSearchConfig() ở lib/searchConcepts.ts có thể nạp thêm khái niệm
// từ DB/Admin mà KHÔNG cần sửa code). filterPlaces nhận config nên cùng 1 engine
// chạy được cho mọi khái niệm hiện tại lẫn tương lai.
//
// Khớp text: ranh giới TỪ cho Latin (tránh "an" ⊂ "tenmangu"); substring cho CJK
// (không có khoảng trắng phân từ). Giá khớp theo trường có cấu trúc place.fee.
// ============================================================

export interface PlaceCriteria {
  /** Từ khóa tự do — khớp tên, khu vực, chủ đề, mô tả, giá (không phân biệt dấu) */
  q?: string;
  /** Lọc theo mã chủ đề (category code). Rỗng = mọi chủ đề */
  categories?: string[];
  /** Lọc theo tỉnh (mở rộng toàn quốc). Bỏ trống = mọi tỉnh */
  prefecture?: string | null;
}

/**
 * Chuẩn hóa text để so khớp: NFKD (gập full-width→half-width, dakuten/jamo về dạng
 * tách), bỏ dấu Latin/tiếng Việt, đ→d, thường hóa, gộp khoảng trắng. CJK ideograph
 * không bị tách. Idempotent (chuẩn-hóa-lại không đổi).
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // dấu phụ Latin + tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tách chuỗi (đã chuẩn hóa) thành token: cắt theo mọi ký tự KHÔNG phải latin/số/ký
 * tự ngoài ASCII (CJK·kana·hangul trong U+0080..U+FFFF được giữ) — tức cắt theo
 * khoảng trắng + dấu câu ASCII (gồm `-`, `/`, `&`, `'`…). Không dùng cờ /u.
 */
export function tokenize(normalizedRest: string): string[] {
  return normalizedRest.split(/[^a-z0-9-￿]+/).filter(Boolean);
}

/** Token thuần ASCII (latin/số) — khớp theo ranh giới từ; ngược lại (CJK) substring. */
function isLatinToken(tok: string): boolean {
  return /^[a-z0-9]+$/.test(tok);
}

/**
 * Một TỪ trong trường có khớp token Latin không? CHỈ khớp TỪ HOÀN CHỈNH (diệt
 * substring over-matching: "an" KHÔNG lọt "tenmangu"). Có xử lý số nhiều tiếng Anh
 * an toàn: "parks"↔"park" (chỉ thêm/bớt "s" cuối, độ dài gốc ≥ 4). KHÔNG dùng tiền
 * tố tổng quát — vì âm tiết tiếng Việt 3 chữ hay là tiền tố của từ khác nghĩa
 * ("nhau"⊅"nhà", "quán"⊅"qua"); biến thể khác đã có trong synonym/alias rõ ràng.
 */
function wordMatches(word: string, tok: string): boolean {
  if (word === tok) return true;
  if (tok.endsWith('s') && tok.length >= 4 && word === tok.slice(0, -1)) return true; // "parks"→"park"
  if (word.endsWith('s') && word.length >= 4 && tok === word.slice(0, -1)) return true; // "park"→"parks"
  return false;
}

interface FieldIndex { str: string; words: string[] }
function fieldIndex(normalizedStr: string): FieldIndex {
  return { str: normalizedStr, words: tokenize(normalizedStr) };
}
/** Trường (đã index) có chứa token không — ranh giới từ cho Latin, substring cho CJK. */
function fieldHasToken(fi: FieldIndex, tok: string): boolean {
  if (isLatinToken(tok)) {
    for (const w of fi.words) if (wordMatches(w, tok)) return true;
    return false;
  }
  return fi.str.includes(tok);
}

// ── Các loại khái niệm tìm kiếm (config-driven) ─────────────────────────────

/** Mức độ tin cậy của bằng chứng facet (để xếp hạng & loại bằng chứng yếu). */
export interface FeatureFacet {
  key: string;
  /** Cụm KÍCH HOẠT facet trong TRUY VẤN (đa ngôn ngữ; Latin nhiều-từ khớp ranh giới từ, CJK substring). */
  aliases: string[];
  /** Bằng chứng MẠNH tìm trong dữ liệu địa điểm (tên/mô tả/tag/amenity). CHỈ cụm mạnh — KHÔNG đưa cụm yếu (rượu/bia/đêm) vào đây. */
  evidence: string[];
  /** Tên trường boolean cấp item chứng minh facet (khi schema bổ sung). */
  structuredFlags?: string[];
}

export interface SearchConfig {
  /** B. facet cấp item. */
  facets: FeatureFacet[];
  /** A. alias (đã chuẩn hóa, phân tách khoảng trắng) cho từng CATEGORY CODE — dùng khi category ĐẠI DIỆN CHÍNH XÁC khái niệm. */
  categories: Record<string, string>;
  /** Cụm chỉ ý định MIỄN PHÍ trong truy vấn. */
  freeTerms: string[];
  /** Cụm chỉ ý định CÓ PHÍ trong truy vấn. */
  paidTerms: string[];
  /** Từ nối bị bỏ qua khi tokenize ("và"/"and" — "&" đã bị tokenize cắt). */
  connectors: string[];
}

// Trọng số bằng chứng facet theo độ TIN CẬY của nguồn.
const W_FACET_STRUCT = 12; // structured field / amenity / tag rõ ràng — mạnh nhất
const W_FACET_NAME = 9;    // tên feature trong title
const W_FACET_DESC = 4;    // cụm feature mạnh trong summary
const W_FACET_BODY = 2;    // cụm feature mạnh trong body

// Trọng số trường cho text thường (không-facet).
const W_SYNONYM = 10; // alias category đại diện chính xác
const W_NAME = 8;
const W_TAG = 6;
const W_LABEL = 5;
const W_AREA = 3;
const W_DESC = 2;     // summary

/** Bỏ thẻ HTML khỏi body trước khi index (body là rich-text HTML). */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ');
}

// ── CẤU HÌNH MẶC ĐỊNH (nguồn sự thật built-in; DB có thể bổ sung qua loader) ──
// LƯU Ý: category gộp KHÔNG nhồi tính năng con (BBQ/camping/picnic/nightlife) vào
// alias — chúng là facet bên dưới. Mọi alias/evidence được normalizeText một lần.
export const DEFAULT_SEARCH_CONFIG: SearchConfig = normalizeConfig({
  categories: {
    landmark: 'du lich landmark sightseeing tham quan diem den 観光 観光地 ランドマーク 名所 관광 명소 观光 景点 地标',
    food: 'an dem an uong do an duong pho yatai street food 屋台 グルメ 夜食 야식 길거리 음식 포장마차 夜市 小吃',
    sea: 'bien beach sea seaside tam bien bai bien 海 ビーチ 海岸 海辺 바다 해변 해수욕장 海滩 海边 海滨',
    camp: 'ngoai troi outdoor 野外 アウトドア 아웃도어 户外 戶外',
    mountain: 'leo nui nui hiking mountain trekking 山 登山 ハイキング 산 등산 하이킹 登山 爬山 徒步',
    park: 'cong vien park garden vuon 公園 公园 공원 花园 庭园',
    viet: 'quan viet do an viet vietnamese pho banh mi ベトナム料理 ベトナム 베트남 음식 越南菜 越南料理',
    grocery: 'tap hoa viet sieu thi grocery supermarket スーパー 食材 食料品 식료품 마트 杂货 超市',
    izakaya: 'quan nhau nhat izakaya bia ruou 居酒屋 이자카야 술집 日式酒馆',
    japanese: 'quan nhat do an nhat japanese sushi ramen washoku 和食 日本料理 寿司 ラーメン 일식 일본 음식 스시 라멘 日本料理 日料 寿司 拉面',
    thai: 'quan thai do an thai thai food タイ料理 태국 음식 泰国菜 泰式',
    chinese: 'quan trung do an trung chinese 中華料理 中華 중식 중국 음식 中餐 中国菜',
    korean: 'quan han do an han korean kbbq 韓国料理 韓国 한식 한국 음식 韩国料理 韩餐',
    cafe_milk_tea: 'ca phe tra sua cafe coffee milk tea bubble tea カフェ コーヒー タピオカ ミルクティー 카페 커피 밀크티 버블티 咖啡 奶茶 珍珠奶茶',
    kids_playground: 'khu vui choi tre em kids playground children 子供 遊び場 キッズ 키즈 놀이터 儿童 游乐场 亲子',
    onsen: 'onsen suoi nuoc nong hot spring spa 温泉 スパ 온천 스파 泡汤 泡温泉',
  },
  facets: [
    {
      key: 'bbq',
      // Cố ý KHÔNG gồm "nướng"/"grill" chung chung (lươn nướng…).
      aliases: ['bbq', 'barbecue', 'barbeque', 'kbbq', 'バーベキュー', 'バーベキュ', '바비큐', '바베큐', '烧烤', '烤肉'],
      evidence: ['bbq', 'barbecue', 'barbeque', 'バーベキュー', 'バーベキュ', '바비큐', '바베큐', '烧烤', '烤肉'],
      structuredFlags: ['bbq_allowed', 'has_bbq'],
    },
    {
      key: 'camping',
      aliases: ['camping', 'camp', 'cam trai', 'cap trai', 'キャンプ', 'キャンプ場', '캠핑', '캠프', '露营', '露營', '野営'],
      evidence: ['camping', 'cam trai', 'cap trai', 'キャンプ', '캠핑', '露营', '露營', '野営'],
      structuredFlags: ['camping_allowed', 'has_camping', 'can_camp'],
    },
    {
      key: 'picnic',
      aliases: ['picnic', 'da ngoai', 'ピクニック', '피크닉', '소풍', '野餐'],
      evidence: ['picnic', 'da ngoai', 'ピクニック', '피크닉', '소풍', '野餐'],
      structuredFlags: ['picnic_allowed', 'has_picnic'],
    },
    {
      key: 'nightlife',
      // ALIAS = ý định "vui chơi đêm" CHUNG. Cố ý KHÔNG đưa "izakaya"/"quán nhậu" vào
      // alias (để truy vấn "quán nhậu Nhật" vẫn về CATEGORY izakaya, không đổi nghĩa).
      aliases: ['nightlife', 'night life', 'vui choi dem', 'di choi dem', 'choi dem', 'bar', 'pub', 'club', 'nightclub',
        '夜遊び', 'ナイトライフ', 'ナイトクラブ', 'クラブ', '나이트라이프', '나이트', '夜生活', '夜店', '夜场', '夜場', '酒吧'],
      // EVIDENCE = chỉ cụm MẠNH thiết lập nightlife. KHÔNG gồm cụm YẾU: rượu/bia/
      // ăn đêm/ban đêm/dinner/夜 — một mình chúng KHÔNG chứng minh nightlife.
      // CJK evidence CHỈ dùng cụm đủ đặc thù — KHÔNG dùng バー (⊂ バーベキュー = BBQ).
      // KHÔNG gồm "club" trần (⊂ "Beach Club"/"Golf Club") — dùng "nightclub"; "club"
      // chỉ là ALIAS truy vấn.
      evidence: ['nightlife', 'bar', 'pub', 'nightclub', 'izakaya', 'quan nhau', 'nhau', 'live house', 'livehouse',
        '居酒屋', '酒場', '酒吧', '술집', '夜店', '夜场', '夜場', 'パブ', 'ナイトクラブ'],
      structuredFlags: ['nightlife', 'has_nightlife'],
    },
  ],
  freeTerms: ['mien phi', 'free', 'gratis', 'mienphi', '無料', '무료', '免费', '免費'],
  paidTerms: ['co phi', 'tinh phi', 'mat phi', 'paid', 'cophi', '有料', '유료', '收费', '收費', '付费', '付費'],
  connectors: ['va', 'and', 'hoac', 'or'],
});

/** Chuẩn hóa NFD/case mọi alias/evidence/term trong 1 config (idempotent). */
export function normalizeConfig(config: SearchConfig): SearchConfig {
  return {
    facets: config.facets.map((f) => ({
      ...f,
      aliases: f.aliases.map(normalizeText),
      evidence: f.evidence.map(normalizeText),
    })),
    categories: Object.fromEntries(
      Object.entries(config.categories).map(([k, v]) => [k, normalizeText(v)]),
    ),
    freeTerms: config.freeTerms.map(normalizeText),
    paidTerms: config.paidTerms.map(normalizeText),
    connectors: config.connectors.map(normalizeText),
  };
}

// ── Merge cấu hình khái niệm từ DB/Admin (data-driven) ──────────────────────
// Đặt CHUNG file với engine để node --test import được (module này không có import
// quan hệ tương đối ở runtime). Loader IO (next/cache + supabase) ở lib/searchConcepts.

/** Bản ghi 1 khái niệm tìm kiếm (1 hàng bảng search_concepts). */
export interface ConceptRow {
  key: string;
  type: 'category' | 'facet' | 'tag' | 'amenity' | 'price' | 'general';
  enabled: boolean;
  weight?: number | null;
  category_code?: string | null;
  /** {vi:[],en:[],ja:[],ko:[],zh:[]} */
  aliases?: Record<string, string[]> | null;
  /** {strong:{vi:[],en:[],…}, structured_flags:[]} */
  evidence?: { strong?: Record<string, string[]> | null; structured_flags?: string[] | null } | null;
  matching_mode?: 'boundary' | 'substring' | 'exact' | null;
}

/** Gộp mọi mảng theo ngôn ngữ thành 1 mảng phẳng (bỏ trùng/rỗng); nhận cả ngôn ngữ mới. */
export function flattenLang(obj?: Record<string, string[]> | null): string[] {
  if (!obj) return [];
  const out: string[] = [];
  for (const arr of Object.values(obj)) for (const s of arr ?? []) if (s && s.trim()) out.push(s.trim());
  return Array.from(new Set(out));
}

/**
 * Merge các hàng khái niệm LÊN config nền (mặc định DEFAULT). THUẦN, test được.
 * Hàng `enabled=false` cùng key sẽ GỠ facet mặc định tương ứng.
 */
export function buildConfigFromRows(rows: ConceptRow[], base: SearchConfig = DEFAULT_SEARCH_CONFIG): SearchConfig {
  const facets: FeatureFacet[] = base.facets.map((f) => ({
    key: f.key,
    aliases: [...f.aliases],
    evidence: [...f.evidence],
    structuredFlags: f.structuredFlags ? [...f.structuredFlags] : undefined,
  }));
  const categories: Record<string, string> = { ...base.categories };
  const indexOf = (key: string) => facets.findIndex((f) => f.key === key);

  for (const row of rows) {
    if (!row || !row.key) continue;
    if (row.enabled === false) {
      const i = indexOf(row.key);
      if (i >= 0) facets.splice(i, 1); // gỡ facet bị tắt
      continue;
    }
    const aliases = flattenLang(row.aliases);
    if (row.type === 'facet') {
      const facet: FeatureFacet = {
        key: row.key,
        aliases,
        evidence: flattenLang(row.evidence?.strong),
        structuredFlags: row.evidence?.structured_flags?.length ? [...row.evidence.structured_flags] : undefined,
      };
      const i = indexOf(row.key);
      if (i >= 0) facets[i] = facet;
      else facets.push(facet);
    } else if (row.type === 'category' && row.category_code) {
      categories[row.category_code] = [categories[row.category_code] ?? '', ...aliases].join(' ').trim();
    }
    // 'tag'/'amenity'/'price'/'general': bằng chứng cấp item đến từ place.tags/place.fee.
  }
  return normalizeConfig({ ...base, facets, categories });
}

// ── Trích ý định GIÁ / FACET khỏi truy vấn ──────────────────────────────────

/** Bỏ 1 cụm khỏi chuỗi đã đệm khoảng trắng: ranh giới từ cho Latin, substring cho CJK. */
function stripPhrase(padded: string, term: string): { hit: boolean; padded: string } {
  if (/[a-z0-9]/.test(term)) {
    const bounded = ` ${term} `;
    if (padded.includes(bounded)) return { hit: true, padded: padded.split(bounded).join('  ') };
  } else if (term && padded.includes(term)) {
    return { hit: true, padded: padded.split(term).join(' ') };
  }
  return { hit: false, padded };
}

/** Tách ý định giá (free/paid) khỏi truy vấn; trả phần text còn lại. */
export function extractFeeIntent(
  normalizedQ: string,
  config: SearchConfig = DEFAULT_SEARCH_CONFIG,
): { fee: Fee | null; rest: string } {
  let padded = ` ${normalizeText(normalizedQ)} `;
  let fee: Fee | null = null;
  for (const term of config.freeTerms) {
    const r = stripPhrase(padded, term);
    if (r.hit) { fee = 'free'; padded = r.padded; }
  }
  for (const term of config.paidTerms) {
    const r = stripPhrase(padded, term);
    if (r.hit) { fee = 'paid'; padded = r.padded; }
  }
  return { fee, rest: padded.replace(/\s+/g, ' ').trim() };
}

/** Tách các facet được YÊU CẦU khỏi truy vấn & loại alias khỏi text còn lại. */
export function extractFacets(
  rest: string,
  config: SearchConfig = DEFAULT_SEARCH_CONFIG,
): { facets: FeatureFacet[]; rest: string } {
  let padded = ` ${rest} `;
  const active: FeatureFacet[] = [];
  for (const f of config.facets) {
    let hit = false;
    // Alias dài (nhiều từ) trước để không bị alias ngắn nuốt mất.
    for (const a of [...f.aliases].sort((x, y) => y.length - x.length)) {
      const r = stripPhrase(padded, a);
      if (r.hit) { hit = true; padded = r.padded; }
    }
    if (hit) active.push(f);
  }
  return { facets: active, rest: padded.replace(/\s+/g, ' ').trim() };
}

function tagText(p: Place): string {
  return (p.tags ?? [])
    .map((tg) =>
      [tg.name, tg.display_name_vi, tg.display_name_en, tg.display_name_ja, tg.display_name_ko, tg.display_name_zh]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');
}

/**
 * Trường (đã chuẩn hóa) có chứa BẤT KỲ cụm BẰNG CHỨNG nào không. Latin: khớp THEO
 * RANH GIỚI TỪ/CỤM ("bar" KHÔNG khớp "barbecue") — tokenize rồi nối lại bằng space
 * để dấu câu ("picnic/bbq") trở thành ranh giới. CJK: substring (không có khoảng
 * trắng) — nên evidence CJK PHẢI đặc thù (dùng 居酒屋, KHÔNG dùng バー ⊂ バーベキュー).
 */
function evidenceHit(evidence: string[], normalizedField: string): boolean {
  let bounded: string | null = null; // lazy: chỉ tính khi có evidence Latin
  for (const t of evidence) {
    if (!t) continue;
    if (/[a-z0-9]/.test(t)) {
      if (bounded === null) bounded = ` ${tokenize(normalizedField).join(' ')} `;
      if (bounded.includes(` ${t} `)) return true;
    } else if (normalizedField.includes(t)) {
      return true;
    }
  }
  return false;
}

/**
 * Điểm bằng chứng CẤP ITEM của 1 place cho 1 facet. 0 = không bằng chứng → KHÔNG
 * khớp. Ưu tiên: structured/amenity/tag > tên > summary > body. KHÔNG suy từ category.
 */
export function facetEvidenceScore(p: Place, facet: FeatureFacet): number {
  const struct = p as Place & Record<string, unknown> & { amenities?: string[] | null };
  if (facet.structuredFlags?.some((k) => struct[k] === true)) return W_FACET_STRUCT;
  if (Array.isArray(struct.amenities) && evidenceHit(facet.evidence, normalizeText(struct.amenities.join(' ')))) return W_FACET_STRUCT;
  if (evidenceHit(facet.evidence, normalizeText(tagText(p)))) return W_FACET_STRUCT;
  if (evidenceHit(facet.evidence, normalizeText(p.name))) return W_FACET_NAME;
  if (evidenceHit(facet.evidence, normalizeText(p.desc))) return W_FACET_DESC;
  if (evidenceHit(facet.evidence, normalizeText(stripHtml(p.body ?? '')))) return W_FACET_BODY;
  return 0;
}

/**
 * Điểm liên quan TEXT (không-facet). null nếu CÓ token không khớp ở bất kỳ trường
 * nào (AND fail). Mỗi token lấy trường khớp MẠNH nhất. Khớp ranh-giới-từ (Latin) /
 * substring (CJK). Từ nối ("và"/"and") đã bị loại trước khi vào đây.
 */
function relevanceScore(p: Place, tokens: string[], config: SearchConfig): number | null {
  const name = fieldIndex(normalizeText(p.name));
  const tags = fieldIndex(normalizeText(tagText(p)));
  const label = fieldIndex(normalizeText(p.categoryLabel));
  const area = fieldIndex(normalizeText([p.area, p.city ?? '', p.prefecture ?? ''].join(' ')));
  const syn = fieldIndex(normalizeText(config.categories[p.category] ?? ''));
  const desc = fieldIndex(normalizeText(p.desc));

  // CỐ Ý không index body (content dài) cho text thường: AND nhiều token rải rác
  // trong body sẽ over-match (vd "quán nhậu Nhật" trúng mall vì body lác đác 3 từ).
  // Yêu cầu chỉ cần title/summary(desc)/area/category/tag tìm được. Body vẫn dùng
  // làm BẰNG CHỨNG FACET (1 khái niệm, trọng số yếu) trong facetEvidenceScore.
  let score = 0;
  for (const tok of tokens) {
    let best = 0;
    if (fieldHasToken(syn, tok)) best = W_SYNONYM;
    if (best < W_NAME && fieldHasToken(name, tok)) best = W_NAME;
    if (best < W_TAG && fieldHasToken(tags, tok)) best = W_TAG;
    if (best < W_LABEL && fieldHasToken(label, tok)) best = W_LABEL;
    if (best < W_AREA && fieldHasToken(area, tok)) best = W_AREA;
    if (best < W_DESC && fieldHasToken(desc, tok)) best = W_DESC;
    if (best === 0) return null; // token không khớp ở đâu → loại place
    score += best;
  }
  return score;
}

/**
 * Lọc + XẾP HẠNG địa điểm. Hàm thuần. Ngữ nghĩa:
 *   (mọi FEATURE_FACET cấp item) AND (mọi token text) AND (fee có cấu trúc) — tất cả
 *   phải thỏa. Trong 1 khái niệm: OR giữa các nguồn bằng chứng. Xếp hạng: structured/
 *   tag > tên > alias/category > summary > body. Đồng điểm → giữ thứ tự gốc.
 */
export function filterPlaces(
  places: Place[],
  criteria: PlaceCriteria,
  config: SearchConfig = DEFAULT_SEARCH_CONFIG,
): Place[] {
  const normalizedQ = criteria.q ? normalizeText(criteria.q) : '';
  const { fee: feeFilter, rest: feeRest } = normalizedQ
    ? extractFeeIntent(normalizedQ, config)
    : { fee: null, rest: '' };
  // Tách facet TRƯỚC tokenize để alias nhiều-từ ("cắm trại", "vui chơi đêm") không bị
  // cắt rời và không double-match phần text chung chung.
  const { facets, rest } = feeRest ? extractFacets(feeRest, config) : { facets: [], rest: '' };
  const connectors = new Set(config.connectors);
  const tokens = rest ? tokenize(rest).filter((t) => !connectors.has(t)) : [];
  const cats = criteria.categories?.length ? new Set(criteria.categories) : null;
  const pref = criteria.prefecture ?? null;

  const scored: { p: Place; idx: number; score: number }[] = [];
  places.forEach((p, idx) => {
    if (cats && !cats.has(p.category)) return;
    if (pref && (p.prefecture ?? 'fukuoka') !== pref) return;
    if (feeFilter && p.fee !== feeFilter) return; // giá khớp trường có cấu trúc
    let score = 0;
    for (const f of facets) {
      const e = facetEvidenceScore(p, f);
      if (e === 0) return; // có ý định facet nhưng không có bằng chứng → loại
      score += e;
    }
    if (tokens.length) {
      const s = relevanceScore(p, tokens, config);
      if (s === null) return; // AND across tokens failed
      score += s;
    }
    scored.push({ p, idx, score });
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.map((r) => r.p);
}

// ── Match explainability (DEV-only; KHÔNG render ở UI production) ────────────

export interface MatchReason {
  concept: string;          // 'facet:bbq' | 'category' | 'text' | 'fee'
  source: string;           // 'structured' | 'tag' | 'name' | 'summary' | 'body' | 'category-alias' | 'fee-field'
  field: string;
  alias?: string;
  weight: number;
}

/** Vì sao 1 place khớp 1 truy vấn (debug). Không dùng trong UI bình thường. */
export function explainMatch(
  p: Place,
  q: string,
  config: SearchConfig = DEFAULT_SEARCH_CONFIG,
): { matched: boolean; total: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const normalizedQ = normalizeText(q);
  const { fee, rest: feeRest } = extractFeeIntent(normalizedQ, config);
  const { facets, rest } = extractFacets(feeRest, config);
  const connectors = new Set(config.connectors);
  const tokens = rest ? tokenize(rest).filter((t) => !connectors.has(t)) : [];

  if (fee) {
    if (p.fee !== fee) return { matched: false, total: 0, reasons };
    reasons.push({ concept: 'fee', source: 'fee-field', field: 'fee', weight: 0 });
  }
  for (const f of facets) {
    const e = facetEvidenceScore(p, f);
    if (e === 0) return { matched: false, total: 0, reasons };
    const src = e === W_FACET_STRUCT ? 'structured/tag' : e === W_FACET_NAME ? 'name' : e === W_FACET_DESC ? 'summary' : 'body';
    reasons.push({ concept: `facet:${f.key}`, source: src, field: src, weight: e });
  }
  if (tokens.length) {
    const s = relevanceScore(p, tokens, config);
    if (s === null) return { matched: false, total: 0, reasons };
    reasons.push({ concept: 'text', source: 'text-fields', field: tokens.join(' '), weight: s });
  }
  const total = reasons.reduce((a, r) => a + r.weight, 0);
  return { matched: true, total, reasons };
}

// ── Tương thích ngược (call-site / test cũ chỉ quan tâm BBQ) ─────────────────
const BBQ_FACET = DEFAULT_SEARCH_CONFIG.facets.find((f) => f.key === 'bbq')!;
/** Token (đã chuẩn hóa) có phải alias BBQ không? */
export function isBbqAlias(tok: string): boolean { return BBQ_FACET.aliases.includes(tok); }
/** Điểm bằng chứng BBQ cấp item. */
export function bbqEvidenceScore(p: Place): number { return facetEvidenceScore(p, BBQ_FACET); }
