// ── Isolated Poker Playtest — environment banner (additive, self-contained) ────────────
//
// Renders a fixed top strip that makes the isolated test environment IMPOSSIBLE to confuse with
// production. Reads NEXT_PUBLIC_APP_ENV (inlined at build). Fail-closed: if the value is anything
// other than "local" or "staging" it shows a red "ENV UNVERIFIED" warning rather than nothing.
//
// The label text is intentionally NOT internationalized: a "NOT PRODUCTION" safety marker must be
// unmistakable in every locale. Inline styles keep it independent of app design tokens.
//
// WIRING (manual — do this in your own commit so it doesn't collide with in-flight work):
//   In app/layout.tsx, inside <body>, add near the top:
//       import { PlaytestEnvBanner } from '@/components/PlaytestEnvBanner'
//       ...
//       <PlaytestEnvBanner />
//   It renders nothing in production (NEXT_PUBLIC_APP_ENV unset) unless you want the warning.

const STYLES: Record<string, { bg: string; label: string }> = {
  staging: { bg: '#b45309', label: 'INTERNAL STAGING — NOT PRODUCTION' }, // amber-700
  local: { bg: '#1d4ed8', label: 'LOCAL TEST — NOT PRODUCTION' }, // blue-700
}

export function PlaytestEnvBanner() {
  const env = (process.env.NEXT_PUBLIC_APP_ENV ?? '').trim().toLowerCase()

  // Production (or any deploy that does not declare itself a playtest env): render nothing.
  if (env === '' || env === 'production' || env === 'prod') return null

  const style = STYLES[env] ?? { bg: '#b91c1c', label: `⚠ ENV UNVERIFIED ("${env}") — DO NOT USE FOR PLAYTEST` }

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        width: '100%',
        background: style.bg,
        color: '#fff',
        font: '600 12px/1.4 system-ui, sans-serif',
        letterSpacing: '0.04em',
        textAlign: 'center',
        padding: '4px 8px',
      }}
    >
      {style.label}
    </div>
  )
}

export default PlaytestEnvBanner
