import type { Place } from './places';

// ============================================================
// Lớp trừu tượng tìm kiếm địa điểm.
//
// HÔM NAY: lọc in-memory trên mảng đã tải sẵn (tức thì, không gọi mạng).
// TƯƠNG LAI (toàn quốc, hàng nghìn địa điểm): đổi RUỘT của searchPlaces()
// thành truy vấn Supabase (full-text + phân trang) — UI gọi cùng một
// chữ ký hàm nên KHÔNG phải sửa.
// ============================================================

export interface PlaceCriteria {
  /** Từ khóa tự do — khớp tên, khu vực, chủ đề, mô tả (không phân biệt dấu) */
  q?: string;
  /** Lọc theo mã chủ đề (category code). Rỗng = mọi chủ đề */
  categories?: string[];
  /** Lọc theo tỉnh (mở rộng toàn quốc). Bỏ trống = mọi tỉnh */
  prefecture?: string | null;
}

/** Chuẩn hóa text để so khớp: bỏ dấu tiếng Việt, đ→d, thường hóa */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Lọc mảng địa điểm theo tiêu chí. Hàm thuần, dùng được cả ở client lẫn server.
 * Đây là chỗ DUY NHẤT chứa logic so khớp — khi chuyển sang SQL chỉ cần
 * tái hiện logic này phía DB.
 */
export function filterPlaces(places: Place[], criteria: PlaceCriteria): Place[] {
  const q = criteria.q ? normalizeText(criteria.q) : '';
  const cats = criteria.categories?.length ? new Set(criteria.categories) : null;
  const pref = criteria.prefecture ?? null;

  return places.filter((p) => {
    if (cats && !cats.has(p.category)) return false;
    if (pref && (p.prefecture ?? 'fukuoka') !== pref) return false;
    if (q) {
      const haystack = normalizeText(
        `${p.name} ${p.area} ${p.categoryLabel} ${p.desc} ${p.city ?? ''} ${p.prefecture ?? ''} ${(p.tags ?? []).map((tg) => tg.name).join(' ')}`,
      );
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
