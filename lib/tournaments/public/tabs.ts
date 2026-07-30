// Public tournament-detail tab keys ↔ URL slugs (Vietnamese, matching the repo's non-prefixed route
// convention). Kept in a plain (non-'use client') module so BOTH the server route (page.tsx) and the
// client component can import `tabFromSlug` — a function exported from a 'use client' module becomes a
// non-callable client reference when imported into a Server Component, which crashed the detail page.
export const TAB_SLUGS: Record<string, string> = {
  overview: 'tong-quan',
  competitors: 'van-dong-vien',
  schedule: 'lich-thi-dau',
  standings: 'bang-xep-hang',
  bracket: 'nhanh-dau',
  podium: 'thanh-tich',
  rules: 'luat-thi-dau',
}

const SLUG_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_SLUGS).map(([k, v]) => [v, k]),
)

export function tabFromSlug(slug: string | undefined): string {
  return slug && SLUG_TO_TAB[slug] ? SLUG_TO_TAB[slug] : 'overview'
}
