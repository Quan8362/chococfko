import type { MetadataRoute } from 'next'

// Web App Manifest (auto-served at /manifest.webmanifest and auto-linked by Next.js).
// Enables an installed / standalone Home-Screen experience — the ONLY way to get a true
// chrome-free, maximal game area on Chrome/Safari for iPhone & iPad, where the in-page
// Fullscreen API is unavailable for non-video elements. Kept static (no per-request i18n)
// so it can be generated at build time without forcing dynamic rendering.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chợ Cóc FKO',
    short_name: 'Chợ Cóc FKO',
    description: 'Cộng đồng người Việt — địa điểm, bài viết, mini game.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf4ea',
    theme_color: '#faf4ea',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
