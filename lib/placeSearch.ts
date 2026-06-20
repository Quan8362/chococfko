import type { Place, Fee } from './places';

// ============================================================
// Lớp trừu tượng tìm kiếm địa điểm.
//
// HÔM NAY: lọc in-memory trên mảng đã tải sẵn (tức thì, không gọi mạng).
// TƯƠNG LAI (toàn quốc, hàng nghìn địa điểm): đổi RUỘT của filterPlaces()
// thành truy vấn Supabase (full-text + phân trang) — UI gọi cùng một
// chữ ký hàm nên KHÔNG phải sửa.
//
// Semantics (khớp ý định người dùng):
//   • Truy vấn được tách thành các "token khái niệm" theo khoảng trắng/dấu câu.
//   • AND giữa các token, OR giữa các trường trong cùng một place.
//   • Mỗi category code có bộ từ đồng nghĩa ĐA NGÔN NGỮ (vi/en/ja/ko/zh) nên
//     "camping", "onsen", "海", "캠핑"… khớp đúng chủ đề dù nhãn lưu chỉ là tên
//     ngắn tiếng Việt ("Biển").
//   • Khái niệm GIÁ ("miễn phí" / "free" / "無料" / "무료" / "免费", và phía trả phí)
//     khớp theo TRƯỜNG CÓ CẤU TRÚC place.fee, không phụ thuộc text trong mô tả.
//   • BBQ là FACET CẤP-ĐỊA-ĐIỂM, KHÔNG phải thuộc tính của cả category gộp
//     "Biển & BBQ". Một địa điểm chỉ khớp "BBQ" khi CÓ BẰNG CHỨNG cấp item:
//     trường có cấu trúc (bbq_allowed / has_bbq / amenities), tag BBQ rõ ràng,
//     hoặc BBQ trong tên/mô tả/nội dung. KHÔNG suy ra BBQ chỉ vì đó là bãi biển.
// ============================================================

export interface PlaceCriteria {
  /** Từ khóa tự do — khớp tên, khu vực, chủ đề, mô tả, giá (không phân biệt dấu) */
  q?: string;
  /** Lọc theo mã chủ đề (category code). Rỗng = mọi chủ đề */
  categories?: string[];
  /** Lọc theo tỉnh (mở rộng toàn quốc). Bỏ trống = mọi tỉnh */
  prefecture?: string | null;
}

/** Chuẩn hóa text để so khớp: bỏ dấu tiếng Việt, đ→d, thường hóa. CJK giữ nguyên. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

// Từ đồng nghĩa đa ngôn ngữ cho từng CATEGORY CODE (đã chuẩn hóa: thường, bỏ dấu
// Việt; CJK giữ nguyên). Nhờ đó "beach"/"海" đều khớp category `sea` dù nhãn lưu
// chỉ là "Biển". Khớp bằng substring sau normalizeText.
// LƯU Ý: synonym chỉ chứa khái niệm mà CATEGORY ĐẠI DIỆN CHÍNH XÁC. Với category GỘP
// (nhiều khái niệm) — "Biển & BBQ", "Camping & picnic" — KHÔNG nhồi từng tính năng
// (BBQ / camping / picnic) vào synonym, vì membership KHÔNG chứng minh địa điểm có
// tính năng đó → false positive. Các tính năng đó là FEATURE_FACETS cấp item bên dưới.
const CATEGORY_SYNONYMS: Record<string, string> = {
  landmark: 'du lich landmark sightseeing tham quan diem den 観光 観光地 ランドマーク 名所 관광 명소 观光 景点 地标',
  food: 'an dem an uong vui choi dem do an duong pho yatai street food 屋台 グルメ 夜食 야식 길거리 음식 포장마차 夜市 小吃',
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
};

// Cụm từ chỉ ý định GIÁ trong TRUY VẤN. Chuẩn hóa qua normalizeText (đồng bộ với
// truy vấn đã chuẩn hóa) để hangul/kana không bị lệch dạng dựng-sẵn vs NFD. Khi
// xuất hiện, ta lọc theo trường có cấu trúc place.fee và loại cụm đó khỏi text còn lại.
const FREE_QUERY_TERMS = ['mien phi', 'free', 'gratis', 'mienphi', '無料', '무료', '免费', '免費'].map(normalizeText);
const PAID_QUERY_TERMS = ['co phi', 'tinh phi', 'mat phi', 'paid', 'cophi', '有料', '유료', '收费', '收費', '付费', '付費'].map(normalizeText);

// ── FEATURE FACETS: tính-năng cấp-địa-điểm (KHÔNG phải thuộc tính category gộp) ──
// Category gộp (Biển & BBQ, Camping & picnic) ghép NHIỀU khái niệm. Membership KHÔNG
// chứng minh địa điểm có TỪNG tính năng → mỗi tính năng là 1 FACET: token truy vấn là
// alias của facet khớp địa điểm CHỈ khi có BẰNG CHỨNG cấp item (structured field / tag /
// tên / mô tả), KHÔNG rơi xuống category synonym.
//
// aliases  = cụm KÍCH HOẠT trong TRUY VẤN (đa ngôn ngữ; phần Latin khớp theo ranh giới
//            từ — kể cả nhiều từ; CJK khớp substring). evidence = cụm tìm trong DỮ LIỆU.
// Mọi cụm normalizeText để đồng bộ NFD (dakuten/jamo) với truy vấn đã chuẩn hóa.
interface FeatureFacet {
  key: string;
  aliases: string[];
  evidence: string[];
  structuredFlags?: string[]; // tên trường boolean cấp item (khi schema bổ sung)
}

// Trọng số bằng chứng facet theo độ TIN CẬY: structured field / tag rõ ràng > tên >
// chỉ nhắc trong mô tả (yếu, dễ là nhắc thoáng qua) → đẩy xuống cuối khi xếp hạng.
const W_FACET_STRUCT = 10;
const W_FACET_NAME = 8;
const W_FACET_DESC = 1;

const FEATURE_FACETS: FeatureFacet[] = [
  {
    key: 'bbq',
    // Cố ý KHÔNG gồm "nướng"/"grill" chung chung (lươn nướng…) để tránh false positive.
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
  // GHI CHÚ: facet "nightlife" cho category gộp "Ăn uống & vui chơi đêm" đang CHỜ DUYỆT
  // — chưa bật để tránh đổi ngữ nghĩa "vui chơi đêm" trước review.
];
// Chuẩn hóa NFD một lần cho mọi alias/evidence.
for (const f of FEATURE_FACETS) {
  f.aliases = f.aliases.map(normalizeText);
  f.evidence = f.evidence.map(normalizeText);
}

/**
 * Điểm bằng chứng CẤP ITEM của một place cho 1 facet. 0 = không có bằng chứng → KHÔNG
 * khớp facet đó. Ưu tiên: structured field / amenity / tag > tên > mô tả. KHÔNG bao giờ
 * suy ra từ việc địa điểm thuộc category gộp (Biển & BBQ, Camping & picnic).
 */
export function facetEvidenceScore(p: Place, facet: FeatureFacet): number {
  const struct = p as Place & Record<string, unknown> & { amenities?: string[] | null };
  if (facet.structuredFlags?.some((k) => struct[k] === true)) return W_FACET_STRUCT;
  if (Array.isArray(struct.amenities)) {
    const am = normalizeText(struct.amenities.join(' '));
    if (facet.evidence.some((t) => am.includes(t))) return W_FACET_STRUCT;
  }
  const tags = normalizeText(tagText(p));
  if (facet.evidence.some((t) => tags.includes(t))) return W_FACET_STRUCT;
  const name = normalizeText(p.name);
  if (facet.evidence.some((t) => name.includes(t))) return W_FACET_NAME;
  const text = normalizeText(`${p.desc} ${p.body ?? ''}`);
  if (facet.evidence.some((t) => text.includes(t))) return W_FACET_DESC;
  return 0;
}

/**
 * Tách các facet được YÊU CẦU khỏi truy vấn (đã chuẩn hóa) & loại alias khỏi text còn
 * lại. Alias có ký tự Latin khớp theo ranh giới từ (kể cả nhiều từ — tránh "camp" ⊂
 * "camping"); alias CJK/kana/hangul khớp substring (không có khoảng trắng phân từ).
 */
export function extractFacets(rest: string): { facets: FeatureFacet[]; rest: string } {
  let padded = ` ${rest} `;
  const active: FeatureFacet[] = [];
  for (const f of FEATURE_FACETS) {
    let hit = false;
    for (const a of f.aliases) {
      if (/[a-z0-9]/.test(a)) {
        const bounded = ` ${a} `;
        if (padded.includes(bounded)) { hit = true; padded = padded.split(bounded).join('  '); }
      } else if (padded.includes(a)) {
        hit = true; padded = padded.split(a).join(' ');
      }
    }
    if (hit) active.push(f);
  }
  return { facets: active, rest: padded.replace(/\s+/g, ' ').trim() };
}

// Tương thích ngược cho call-site / test cũ chỉ quan tâm BBQ.
const BBQ_FACET = FEATURE_FACETS.find((f) => f.key === 'bbq')!;
/** Token (đã chuẩn hóa) có phải alias BBQ không? */
export function isBbqAlias(tok: string): boolean { return BBQ_FACET.aliases.includes(tok); }
/** Điểm bằng chứng BBQ cấp item. */
export function bbqEvidenceScore(p: Place): number { return facetEvidenceScore(p, BBQ_FACET); }

/** Tách ý định giá (free/paid) khỏi truy vấn đã chuẩn hóa; trả về phần text còn lại. */
export function extractFeeIntent(normalizedQ: string): { fee: Fee | null; rest: string } {
  // Chuẩn hóa lại (idempotent với chuỗi đã chuẩn hóa) để khớp đúng cả khi caller
  // truyền vào dạng dựng-sẵn (vd "무료") — đồng bộ với FREE/PAID đã normalizeText.
  let rest = ` ${normalizeText(normalizedQ)} `;
  let fee: Fee | null = null;
  for (const term of FREE_QUERY_TERMS) {
    if (rest.includes(term)) { fee = 'free'; rest = rest.split(term).join(' '); }
  }
  for (const term of PAID_QUERY_TERMS) {
    if (rest.includes(term)) { fee = 'paid'; rest = rest.split(term).join(' '); }
  }
  return { fee, rest: rest.trim() };
}

/**
 * Tách chuỗi (đã chuẩn hóa) thành token: tách theo mọi ký tự KHÔNG phải chữ
 * latin/số/ký tự ngoài ASCII (CJK·kana·hangul nằm trong dải U+0080..U+FFFF nên được
 * giữ nguyên) — tức là tách theo khoảng trắng + dấu câu ASCII. Không dùng cờ /u
 * để tương thích target TS của dự án.
 */
export function tokenize(normalizedRest: string): string[] {
  return normalizedRest.split(/[^a-z0-9\u0080-\uffff]+/).filter(Boolean);
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

// Trọng số trường theo độ liên quan. Khớp ĐÚNG CHỦ ĐỀ (synonym của category) là tín
// hiệu mạnh nhất cho truy vấn khái niệm như "BBQ"; khớp chỉ trong MÔ TẢ dài là yếu
// nhất (dễ là nhắc thoáng qua) nên bị đẩy xuống cuối.
const W_SYNONYM = 10;
const W_NAME = 8;
const W_TAG = 6;
const W_LABEL = 5;
const W_AREA = 3;
const W_DESC = 1;

/**
 * Điểm liên quan của một place với danh sách token. Trả về null nếu CÓ token không
 * khớp ở bất kỳ trường nào (AND fail). Mỗi token lấy trường khớp MẠNH nhất.
 */
function relevanceScore(p: Place, tokens: string[]): number | null {
  const name = normalizeText(p.name);
  const tags = normalizeText(tagText(p));
  const label = normalizeText(p.categoryLabel);
  const area = normalizeText([p.area, p.city ?? '', p.prefecture ?? ''].join(' '));
  const syn = normalizeText(CATEGORY_SYNONYMS[p.category] ?? '');
  const desc = normalizeText(p.desc);

  let score = 0;
  for (const tok of tokens) {
    let best = 0;
    if (syn.includes(tok)) best = W_SYNONYM;
    if (best < W_NAME && name.includes(tok)) best = W_NAME;
    if (best < W_TAG && tags.includes(tok)) best = W_TAG;
    if (best < W_LABEL && label.includes(tok)) best = W_LABEL;
    if (best < W_AREA && area.includes(tok)) best = W_AREA;
    if (best < W_DESC && desc.includes(tok)) best = W_DESC;
    if (best === 0) return null; // token không khớp ở đâu cả → loại place
    score += best;
  }
  return score;
}

/**
 * Lọc + XẾP HẠNG địa điểm theo tiêu chí. Hàm thuần, dùng được cả ở client lẫn server.
 * Đây là chỗ DUY NHẤT chứa logic so khớp — khi chuyển sang SQL chỉ cần tái hiện.
 *
 * Ngữ nghĩa: (FEATURE_FACETS cấp item) AND (category/tag/text concept) AND (cấu trúc
 * fee nếu truy vấn nhắc tới giá) — TẤT CẢ phải thỏa. Rồi xếp theo độ liên quan: khớp
 * đúng chủ đề / có bằng chứng facet rõ ràng đứng TRƯỚC, chỉ-trong-mô-tả đứng CUỐI.
 * Đồng điểm → giữ thứ tự gốc (sort_order từ DB).
 */
export function filterPlaces(places: Place[], criteria: PlaceCriteria): Place[] {
  const normalizedQ = criteria.q ? normalizeText(criteria.q) : '';
  const { fee: feeFilter, rest: feeRest } = normalizedQ ? extractFeeIntent(normalizedQ) : { fee: null, rest: '' };
  // Tách facet (BBQ / camping / picnic…) TRƯỚC khi tokenize, để alias nhiều-từ ("cắm
  // trại", "dã ngoại") không bị cắt rời và không double-match phần text chung chung.
  const { facets, rest } = feeRest ? extractFacets(feeRest) : { facets: [], rest: '' };
  const tokens = rest ? tokenize(rest) : [];
  const cats = criteria.categories?.length ? new Set(criteria.categories) : null;
  const pref = criteria.prefecture ?? null;

  const scored: { p: Place; idx: number; score: number }[] = [];
  places.forEach((p, idx) => {
    if (cats && !cats.has(p.category)) return;
    if (pref && (p.prefecture ?? 'fukuoka') !== pref) return;
    if (feeFilter && p.fee !== feeFilter) return; // giá khớp trường có cấu trúc
    let score = 0;
    // Mỗi facet là điều kiện AND, khớp CHỈ qua bằng chứng cấp item.
    for (const f of facets) {
      const e = facetEvidenceScore(p, f);
      if (e === 0) return; // có ý định facet nhưng địa điểm không có bằng chứng → loại
      score += e;
    }
    if (tokens.length) {
      const s = relevanceScore(p, tokens);
      if (s === null) return; // AND across tokens failed
      score += s;
    }
    scored.push({ p, idx, score });
  });

  // Điểm cao trước; đồng điểm giữ nguyên thứ tự gốc (sort_order từ DB).
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.map((r) => r.p);
}
