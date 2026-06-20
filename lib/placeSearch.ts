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
//     "BBQ", "camping", "onsen", "海", "캠핑"… khớp đúng chủ đề dù nhãn lưu chỉ là
//     tên ngắn tiếng Việt ("Biển").
//   • Khái niệm GIÁ ("miễn phí" / "free" / "無料" / "무료" / "免费", và phía trả phí)
//     khớp theo TRƯỜNG CÓ CẤU TRÚC place.fee, không phụ thuộc text trong mô tả.
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
// Việt; CJK giữ nguyên). Nhờ đó "BBQ"/"beach"/"海" đều khớp category `sea` dù nhãn
// lưu chỉ là "Biển". Khớp bằng substring sau normalizeText.
const CATEGORY_SYNONYMS: Record<string, string> = {
  landmark: 'du lich landmark sightseeing tham quan diem den 観光 観光地 ランドマーク 名所 관광 명소 观光 景点 地标',
  food: 'an dem an uong vui choi dem do an duong pho yatai street food 屋台 グルメ 夜食 야식 길거리 음식 포장마차 夜市 小吃',
  sea: 'bien bbq beach sea seaside barbecue tam bien bai bien 海 ビーチ 海岸 海辺 バーベキュー 바다 해변 해수욕장 바비큐 海滩 海边 海滨 烧烤 烤肉',
  camp: 'camping picnic cam trai cap trai da ngoai bbq barbecue キャンプ ピクニック 野外 캠핑 피크닉 야영 露营 野餐',
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

// Cụm từ chỉ ý định GIÁ trong TRUY VẤN (đã chuẩn hóa). Khi xuất hiện, ta lọc theo
// trường có cấu trúc place.fee và loại cụm đó khỏi phần text còn lại.
const FREE_QUERY_TERMS = ['mien phi', 'free', 'gratis', 'mienphi', '無料', '무료', '免费', '免費'];
const PAID_QUERY_TERMS = ['co phi', 'tinh phi', 'mat phi', 'paid', 'cophi', '有料', '유료', '收费', '收費', '付费', '付費'];

/** Tách ý định giá (free/paid) khỏi truy vấn đã chuẩn hóa; trả về phần text còn lại. */
export function extractFeeIntent(normalizedQ: string): { fee: Fee | null; rest: string } {
  let rest = ` ${normalizedQ} `;
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

/** Tài liệu tìm kiếm đã chuẩn hóa của một place. */
function buildDoc(p: Place): string {
  const tagText = (p.tags ?? [])
    .map((tg) =>
      [tg.name, tg.display_name_vi, tg.display_name_en, tg.display_name_ja, tg.display_name_ko, tg.display_name_zh]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');
  return normalizeText(
    [
      p.name,
      p.area,
      p.categoryLabel,
      p.desc,
      p.city ?? '',
      p.prefecture ?? '',
      tagText,
      CATEGORY_SYNONYMS[p.category] ?? '',
    ].join(' '),
  );
}

/**
 * Lọc mảng địa điểm theo tiêu chí. Hàm thuần, dùng được cả ở client lẫn server.
 * Đây là chỗ DUY NHẤT chứa logic so khớp — khi chuyển sang SQL chỉ cần tái hiện.
 *
 * Ngữ nghĩa:  (category/tag/text concept) AND (cấu trúc fee nếu truy vấn nhắc tới giá)
 */
export function filterPlaces(places: Place[], criteria: PlaceCriteria): Place[] {
  const normalizedQ = criteria.q ? normalizeText(criteria.q) : '';
  const { fee: feeFilter, rest } = normalizedQ ? extractFeeIntent(normalizedQ) : { fee: null, rest: '' };
  const tokens = rest ? tokenize(rest) : [];
  const cats = criteria.categories?.length ? new Set(criteria.categories) : null;
  const pref = criteria.prefecture ?? null;

  return places.filter((p) => {
    if (cats && !cats.has(p.category)) return false;
    if (pref && (p.prefecture ?? 'fukuoka') !== pref) return false;
    // Khái niệm giá → khớp trường có cấu trúc (AND với phần còn lại).
    if (feeFilter && p.fee !== feeFilter) return false;
    if (tokens.length) {
      const doc = buildDoc(p);
      for (const tok of tokens) if (!doc.includes(tok)) return false; // AND across tokens
    }
    return true;
  });
}
