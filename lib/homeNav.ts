// Pure helpers for homepage search-in-URL state + logo "return to default" behavior.
// Tách riêng (không phụ thuộc React/Next) để unit-test được bằng node --test.

export const HOME_RESET_EVENT = 'choco:home-reset';

/** Build the homepage URL for a search query (empty/whitespace → clean path, no ?q). */
export function searchUrl(pathname: string, q: string): string {
  const trimmed = q.trim();
  return trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname || '/';
}

/** Đọc query từ chuỗi search params (giá trị đã trim). */
export function queryFromParams(get: (key: string) => string | null): string {
  return (get('q') ?? '').trim();
}

/** Logo click trên trang chủ = reset same-route (xoá query); ngoài trang chủ = điều hướng về "/". */
export function isHomePath(pathname: string | null | undefined): boolean {
  return pathname === '/';
}
