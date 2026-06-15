// ============================================================
// Dữ liệu tham chiếu hành chính Nhật Bản — 47 tỉnh theo 9 vùng.
// Tên hiển thị dùng romaji (trung tính ngôn ngữ, không cần dịch 5 thứ tiếng).
// Mã code khớp với cột `region` / `prefecture` trong bảng places.
// ============================================================

export interface Prefecture {
  code: string;
  name: string;
  region: string;
}

export const REGIONS = [
  "hokkaido",
  "tohoku",
  "kanto",
  "chubu",
  "kansai",
  "chugoku",
  "shikoku",
  "kyushu",
  "okinawa",
] as const;

export const PREFECTURES: Prefecture[] = [
  { code: "hokkaido", name: "Hokkaido", region: "hokkaido" },
  { code: "aomori", name: "Aomori", region: "tohoku" },
  { code: "iwate", name: "Iwate", region: "tohoku" },
  { code: "miyagi", name: "Miyagi", region: "tohoku" },
  { code: "akita", name: "Akita", region: "tohoku" },
  { code: "yamagata", name: "Yamagata", region: "tohoku" },
  { code: "fukushima", name: "Fukushima", region: "tohoku" },
  { code: "ibaraki", name: "Ibaraki", region: "kanto" },
  { code: "tochigi", name: "Tochigi", region: "kanto" },
  { code: "gunma", name: "Gunma", region: "kanto" },
  { code: "saitama", name: "Saitama", region: "kanto" },
  { code: "chiba", name: "Chiba", region: "kanto" },
  { code: "tokyo", name: "Tokyo", region: "kanto" },
  { code: "kanagawa", name: "Kanagawa", region: "kanto" },
  { code: "niigata", name: "Niigata", region: "chubu" },
  { code: "toyama", name: "Toyama", region: "chubu" },
  { code: "ishikawa", name: "Ishikawa", region: "chubu" },
  { code: "fukui", name: "Fukui", region: "chubu" },
  { code: "yamanashi", name: "Yamanashi", region: "chubu" },
  { code: "nagano", name: "Nagano", region: "chubu" },
  { code: "gifu", name: "Gifu", region: "chubu" },
  { code: "shizuoka", name: "Shizuoka", region: "chubu" },
  { code: "aichi", name: "Aichi", region: "chubu" },
  { code: "mie", name: "Mie", region: "kansai" },
  { code: "shiga", name: "Shiga", region: "kansai" },
  { code: "kyoto", name: "Kyoto", region: "kansai" },
  { code: "osaka", name: "Osaka", region: "kansai" },
  { code: "hyogo", name: "Hyogo", region: "kansai" },
  { code: "nara", name: "Nara", region: "kansai" },
  { code: "wakayama", name: "Wakayama", region: "kansai" },
  { code: "tottori", name: "Tottori", region: "chugoku" },
  { code: "shimane", name: "Shimane", region: "chugoku" },
  { code: "okayama", name: "Okayama", region: "chugoku" },
  { code: "hiroshima", name: "Hiroshima", region: "chugoku" },
  { code: "yamaguchi", name: "Yamaguchi", region: "chugoku" },
  { code: "tokushima", name: "Tokushima", region: "shikoku" },
  { code: "kagawa", name: "Kagawa", region: "shikoku" },
  { code: "ehime", name: "Ehime", region: "shikoku" },
  { code: "kochi", name: "Kochi", region: "shikoku" },
  { code: "fukuoka", name: "Fukuoka", region: "kyushu" },
  { code: "saga", name: "Saga", region: "kyushu" },
  { code: "nagasaki", name: "Nagasaki", region: "kyushu" },
  { code: "kumamoto", name: "Kumamoto", region: "kyushu" },
  { code: "oita", name: "Oita", region: "kyushu" },
  { code: "miyazaki", name: "Miyazaki", region: "kyushu" },
  { code: "kagoshima", name: "Kagoshima", region: "kyushu" },
  { code: "okinawa", name: "Okinawa", region: "okinawa" },
];

export const PREFECTURE_NAME: Record<string, string> = Object.fromEntries(
  PREFECTURES.map((p) => [p.code, p.name]),
);

/** Tên hiển thị của một mã tỉnh; fallback viết hoa chữ đầu nếu chưa có trong bảng */
export function prefectureName(code: string): string {
  return PREFECTURE_NAME[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}
