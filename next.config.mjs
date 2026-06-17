import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Conservative security headers. The CSP intentionally omits script-src/style-src
// (Next.js App Router injects inline hydration scripts; locking those down needs a
// nonce pipeline) and only sets directives that are safe across the whole app:
//   - frame-ancestors 'none'  → clickjacking protection
//   - object-src 'none'       → no plugins/embeds
//   - base-uri 'self'         → blocks <base> tag injection
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
]

// Permanent (308) redirects from the old Vietnamese public URLs to the new
// English URLs. Next's `permanent: true` emits 308 Permanent Redirect, which
// Google treats equivalently to 301 for ranking/consolidation. Order matters:
// more specific sub-routes are listed before their generic wildcard so they win.
// `:path*` matches zero-or-more trailing segments, so each rule also covers the
// bare base path (e.g. /tieng-nhat/tu-dien → /japanese/dictionary).
// Note: /dia-diem/:path* will NOT match /dia-diem-da-luu (different segment).
const LEGACY_REDIRECTS = [
  // ── Japanese learning ──────────────────────────────────────────────
  { source: '/tieng-nhat/tu-dien/:path*',   destination: '/japanese/dictionary/:path*' },
  { source: '/tieng-nhat/tu-vung/:path*',   destination: '/japanese/vocabulary/:path*' },
  { source: '/tieng-nhat/ngu-phap/:path*',  destination: '/japanese/grammar/:path*' },
  { source: '/tieng-nhat/kanji/:path*',     destination: '/japanese/kanji/:path*' },
  { source: '/tieng-nhat/luyen-tap/:path*', destination: '/japanese/practice/:path*' },
  { source: '/tieng-nhat/flashcard/:path*', destination: '/japanese/flashcards/:path*' },
  { source: '/tieng-nhat/tap-viet/:path*',  destination: '/japanese/writing/:path*' },
  { source: '/tieng-nhat/thi-thu/:path*',   destination: '/japanese/jlpt-mock-test/:path*' },
  { source: '/tieng-nhat/ho-so/:path*',     destination: '/japanese/profile/:path*' },
  { source: '/tieng-nhat/:path*',           destination: '/japanese/:path*' },

  // ── Community ──────────────────────────────────────────────────────
  { source: '/cong-dong/viet-bai/:path*',   destination: '/community/write/:path*' },
  { source: '/cong-dong/:path*',            destination: '/community/:path*' },

  // ── Places / Explore ───────────────────────────────────────────────
  { source: '/dia-diem/dang/:path*',        destination: '/places/new/:path*' },
  { source: '/dia-diem/:path*',             destination: '/places/:path*' },
  { source: '/kham-pha/:path*',             destination: '/places/:path*' },

  // ── Marketplace (chợ đồ cũ) ────────────────────────────────────────
  { source: '/cho-do-cu/cua-toi/:path*',    destination: '/marketplace/mine/:path*' },
  { source: '/cho-do-cu/dang/:path*',       destination: '/marketplace/new/:path*' },
  { source: '/cho-do-cu/sua/:path*',        destination: '/marketplace/edit/:path*' },
  { source: '/cho-do-cu/:path*',            destination: '/marketplace/:path*' },

  // ── Confessions write ──────────────────────────────────────────────
  { source: '/confessions/viet-bai/:path*', destination: '/confessions/write/:path*' },

  // ── Other public content ───────────────────────────────────────────
  { source: '/dia-diem-da-luu/:path*',      destination: '/saved-places/:path*' },
  { source: '/bai-viet-cua-toi/:path*',     destination: '/my-posts/:path*' },
  { source: '/huong-dan-viet-bai/:path*',   destination: '/posting-guide/:path*' },
  { source: '/nguoi-dung/:path*',           destination: '/users/:path*' },
  { source: '/ban-do/:path*',               destination: '/map/:path*' },
  { source: '/gioi-thieu/:path*',           destination: '/about/:path*' },
  { source: '/lien-he/:path*',              destination: '/contact/:path*' },
  { source: '/gop-y/:path*',                destination: '/feedback/:path*' },
  { source: '/chinh-sach/:path*',           destination: '/privacy-policy/:path*' },

  // ── Account / auth ─────────────────────────────────────────────────
  { source: '/ho-so/:path*',                destination: '/profile/:path*' },
  { source: '/dang-nhap/:path*',            destination: '/login/:path*' },
  { source: '/dang-ky/:path*',              destination: '/register/:path*' },
  { source: '/quen-mat-khau/:path*',        destination: '/forgot-password/:path*' },
  { source: '/dat-lai-mat-khau/:path*',     destination: '/reset-password/:path*' },

  // ── Admin (internal — kept consistent in English) ──────────────────
  { source: '/admin/tieng-nhat/tu-dien/:path*',  destination: '/admin/japanese/dictionary/:path*' },
  { source: '/admin/tieng-nhat/ngu-phap/:path*', destination: '/admin/japanese/grammar/:path*' },
  { source: '/admin/tieng-nhat/binh-luan/:path*', destination: '/admin/japanese/comments/:path*' },
  { source: '/admin/tieng-nhat/:path*',          destination: '/admin/japanese/:path*' },
  { source: '/admin/cho-do-cu/:path*',           destination: '/admin/marketplace/:path*' },
  { source: '/admin/dia-diem/:path*',            destination: '/admin/places/:path*' },
].map(r => ({ ...r, permanent: true }))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'loremflickr.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'pixabay.com' },
      { protocol: 'https', hostname: 'cdn.pixabay.com' },
    ],
  },
  async redirects() {
    return LEGACY_REDIRECTS
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default withNextIntl(nextConfig)
