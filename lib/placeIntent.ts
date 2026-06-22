// ============================================================
// Deterministic intent extraction for Explore search (NO AI dependency).
//
// Parses a free-text query into structured intent (price / open-now / nearby /
// station / area / suitability / facilities / time) and returns the residual
// text (`rest`) for the existing relevance engine (lib/placeSearch.ts), which
// continues to own free-text + fee + feature-facet (bbq/camping/nightlife)
// matching. Multilingual phrase tables (vi/en/ja/ko/zh + romaji) are the source
// of truth; new wording is added here or via Admin Search Concepts.
//
// Matching is boundary-aware (Latin = whole words; CJK = substring) — never the
// naive substring matching that produces unrelated results.
// ============================================================
import { normalizeText } from './placeSearch.ts';

export interface PlaceIntent {
  rest: string;
  priceMin?: number;
  priceMax?: number;
  openNow?: boolean;
  nearby?: boolean;
  station?: string;
  area?: string;
  children?: boolean;
  solo?: boolean;
  group?: boolean;
  parking?: boolean;
  reservationAvailable?: boolean;
  rainy?: boolean;
  indoor?: boolean;
  outdoor?: boolean;
  wheelchair?: boolean;
  weekend?: boolean;
  timeOfDay?: 'evening';
  /** Intent keys detected — used to "explain active filters" to the user. */
  matched: string[];
}

// Phrase tables (already normalized: lowercase, accents stripped, đ→d, NFKD).
// Latin phrases match on word boundaries; CJK phrases match as substrings.
const GROUPS: { key: keyof PlaceIntent; terms: string[] }[] = [
  { key: 'nearby', terms: ['gan toi', 'gan day', 'quanh day', 'gan vi tri cua toi', 'near me', 'nearby', 'near here', 'around me', '近く', '近所', '周辺', '現在地', '근처', '내 주변', '附近', '我附近'] },
  { key: 'openNow', terms: ['dang mo cua', 'dang mo', 'con mo cua', 'con mo', 'open now', 'currently open', 'now open', '今営業中', '営業中', '営業している', '지금 영업', '영업중', '영업 중', '营业中', '營業中', '正在营业'] },
  { key: 'children', terms: ['di cung tre em', 'di cung tre', 'tre em', 'tre nho', 'con nho', 'gia dinh', 'family friendly', 'kid friendly', 'with kids', 'for kids', 'children', '子連れ', '子供連れ', '家族向け', '아이 동반', '가족', '키즈', '亲子', '带孩子', '儿童'] },
  { key: 'solo', terms: ['di mot minh', 'mot minh', 'an mot minh', 'solo', 'alone', 'for one', '一人', 'ひとり', '혼자', '一个人', '独自'] },
  { key: 'group', terms: ['di nhom', 'theo nhom', 'di dong', 'group', 'groups', 'for groups', '団体', 'グループ', '단체', '团体', '聚会'] },
  { key: 'parking', terms: ['cho do xe', 'bai do xe', 'co do xe', 'parking', 'car park', '駐車場', '駐車', '주차장', '주차', '停车场', '停车'] },
  { key: 'reservationAvailable', terms: ['dat cho', 'dat ban', 'dat truoc', 'reservation', 'booking', 'reserve', '予約', '예약', '预约', '預約', '訂位'] },
  { key: 'rainy', terms: ['troi mua', 'ngay mua', 'khi mua', 'rainy day', 'rainy', '雨の日', '雨でも', '비 오는 날', '雨天', '下雨'] },
  { key: 'indoor', terms: ['trong nha', 'co mai che', 'indoor', '屋内', '室内', '실내', '室內'] },
  { key: 'outdoor', terms: ['ngoai troi', 'outdoor', '野外', '屋外', 'アウトドア', '야외', '户外', '戶外'] },
  { key: 'wheelchair', terms: ['xe lan', 'wheelchair accessible', 'wheelchair', 'バリアフリー', '車椅子', '휠체어', '无障碍', '無障礙'] },
  { key: 'weekend', terms: ['cuoi tuan', 'weekend', '週末', '주말', '周末'] },
  { key: 'timeOfDay', terms: ['buoi toi', 'ban dem', 'di choi toi', 'evening', 'at night', 'nighttime', '夜', '저녁', '晚上', '夜晚'] },
];

// Generic filler words that don't usefully constrain results — removed from the
// residual so a query like "restaurant near Hakata Station" reduces cleanly.
const FILLERS = [
  'restaurant', 'restaurants', 'nha hang', 'quan an', 'dia diem', 'place', 'places', 'spot', 'spots',
  // light multilingual stop-words that don't discriminate places (kept tight on
  // purpose — never strip meaningful words like "ăn"/"biển"/category aliases).
  'di choi', 'quan', 'noi', 'cho', 'khi', 'co', 'the',
  'レストラン', '店', 'お店', 'の', 'で', '今', '식당', '가게', '장소', '餐厅', '餐廳', '地方',
];

// Currency + price keywords stripped after numeric extraction.
const PRICE_NOISE = [
  'yen', 'jpy', '円', '¥', 'duoi', 'tren', 'tu', 'den', 'toi da', 'khong qua', 'tro xuong', 'tro len',
  'under', 'below', 'over', 'above', 'max', 'min', 'from', 'up to', 'less than', 'or less', 'or more',
  '以下', '以上', 'まで', 'gia', 'price',
];

// Phrase tables must be normalized the SAME way as the query (NFKD folds
// full-width, dakuten, and Hangul jamo) or CJK/Korean phrases would never match.
const N = (arr: string[]) => arr.map(normalizeText);
const GROUPS_N = GROUPS.map((g) => ({ key: g.key, terms: N(g.terms) }));
const FILLERS_N = N(FILLERS);
const PRICE_NOISE_N = N(PRICE_NOISE);
const MARKERS_N = N(['ga', 'eki', 'station', 'gan', 'near']);

function stripTerm(padded: string, term: string): { hit: boolean; padded: string } {
  if (!term) return { hit: false, padded };
  if (/[a-z0-9]/.test(term)) {
    const bounded = ` ${term} `;
    if (padded.includes(bounded)) return { hit: true, padded: padded.split(bounded).join('  ') };
  } else if (padded.includes(term)) {
    return { hit: true, padded: padded.split(term).join(' ') };
  }
  return { hit: false, padded };
}

function stripAll(padded: string, terms: string[]): { hit: boolean; padded: string } {
  let hit = false;
  for (const t of [...terms].sort((a, b) => b.length - a.length)) {
    const r = stripTerm(padded, t);
    if (r.hit) { hit = true; padded = r.padded; }
  }
  return { hit, padded };
}

// ── Price extraction (range / under / over), commas + 万 handled ──
function extractPrice(padded: string): { priceMin?: number; priceMax?: number; padded: string } {
  // Join thousands separators: "3,500" → "3500".
  let s = padded.replace(/(\d),(\d)/g, '$1$2');
  let priceMin: number | undefined;
  let priceMax: number | undefined;
  const num = (x: string) => Number.parseInt(x, 10);

  // Range: 1000-3000 / 1000~3000 / tu 1000 den 3000 / 1000 to 3000
  const range = /(\d{3,7})\s*(?:-|~|—|den|to|から)\s*(\d{3,7})/.exec(s);
  if (range) {
    priceMin = num(range[1]); priceMax = num(range[2]);
    if (priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
    s = s.replace(range[0], ' ');
  }

  if (priceMax === undefined) {
    const under =
      /(?:duoi|under|below|max|up to|less than|toi da|khong qua)\s*(\d{3,7})/.exec(s) ||
      /(\d{3,7})\s*(?:yen|円|¥|jpy)?\s*(?:tro xuong|以下|まで|or less)/.exec(s) ||
      /[<≤]\s*(\d{3,7})/.exec(s);
    if (under) { priceMax = num(under[1]); s = s.replace(under[0], ' '); }
  }
  if (priceMin === undefined) {
    const over =
      /(?:tren|over|above|from|min)\s*(\d{3,7})/.exec(s) ||
      /(\d{3,7})\s*(?:yen|円|¥|jpy)?\s*(?:tro len|以上|or more)/.exec(s) ||
      /[>≥]\s*(\d{3,7})/.exec(s);
    if (over) { priceMin = num(over[1]); s = s.replace(over[0], ' '); }
  }
  return { priceMin, priceMax, padded: s };
}

// ── Station / area extraction (requires an explicit station marker) ──
function extractStation(padded: string): { station?: string; padded: string } {
  // JA: "<name>駅"
  let m = /([a-z0-9ぁ-んァ-ン一-龯]+)駅/.exec(padded);
  if (m) return { station: m[1].trim(), padded: padded.replace(m[0], ' ') };
  // EN: "near <name> station" / "<name> station"
  m = /(?:near\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)?)\s+station/.exec(padded);
  if (m) return { station: m[1].trim(), padded: padded.replace(m[0], ' ') };
  // romaji: "<name> eki"
  m = /\b([a-z0-9]+)\s+eki\b/.exec(padded);
  if (m) return { station: m[1].trim(), padded: padded.replace(m[0], ' ') };
  // VI: "ga <name>"
  m = /\bga\s+([a-z0-9]+)\b/.exec(padded);
  if (m) return { station: m[1].trim(), padded: padded.replace(m[0], ' ') };
  return { padded };
}

function extractArea(padded: string): { area?: string; padded: string } {
  // JA: "<name>周辺 / 近辺 / エリア"
  let m = /([a-z0-9一-龯ぁ-んァ-ン]+)(?:周辺|近辺|エリア)/.exec(padded);
  if (m) return { area: m[1].trim(), padded: padded.replace(m[0], ' ') };
  // VI/EN: "gan <name>" / "near <name>"
  m = /\b(?:gan|near)\s+([a-z0-9]+)\b/.exec(padded);
  if (m) return { area: m[1].trim(), padded: padded.replace(m[0], ' ') };
  return { padded };
}

export function extractIntent(rawQuery: string): PlaceIntent {
  const intent: PlaceIntent = { rest: '', matched: [] };
  let padded = ` ${normalizeText(rawQuery)} `;

  // 1) phrase groups (nearby before station/area so "gần tôi" wins over "gần X")
  for (const g of GROUPS_N) {
    const r = stripAll(padded, g.terms);
    if (r.hit) {
      padded = r.padded;
      if (g.key === 'timeOfDay') intent.timeOfDay = 'evening';
      else (intent as unknown as Record<string, unknown>)[g.key as string] = true;
      intent.matched.push(g.key as string);
    }
  }

  // 2) price
  const price = extractPrice(padded);
  padded = price.padded;
  if (price.priceMin !== undefined) { intent.priceMin = price.priceMin; intent.matched.push('priceMin'); }
  if (price.priceMax !== undefined) { intent.priceMax = price.priceMax; intent.matched.push('priceMax'); }

  // 3) station, then area
  const st = extractStation(padded);
  if (st.station) { intent.station = st.station; intent.matched.push('station'); padded = st.padded; }
  const ar = extractArea(padded);
  if (ar.area) { intent.area = ar.area; intent.matched.push('area'); padded = ar.padded; }

  // 4) clean residual: price noise + fillers + leftover markers
  padded = stripAll(padded, PRICE_NOISE_N).padded;
  padded = stripAll(padded, FILLERS_N).padded;
  padded = stripAll(padded, MARKERS_N).padded;

  intent.rest = padded.replace(/\s+/g, ' ').trim();
  return intent;
}
