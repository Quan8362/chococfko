// ── Poker portal icon set ────────────────────────────────────────────────────────────────────
// Lightweight, dependency-free inline SVG. One professional family, hand-authored on a 24×24 grid
// with a consistent 1.8 stroke, round caps/joins, and `currentColor` so every icon inherits its
// container's tone. Suits are filled glyphs (never OS emoji — those break suit colours on Windows,
// the same lesson as the card modules). PURE presentational — safe in server components.

import type { SVGProps } from 'react'

export type IconName =
  | 'spade' | 'heart' | 'diamond' | 'club'
  | 'play' | 'cards' | 'plus' | 'book' | 'list' | 'user' | 'chart' | 'settings'
  | 'search' | 'lock' | 'globe' | 'users' | 'eye' | 'shield' | 'info' | 'trophy'
  | 'sparkles' | 'bot' | 'refresh' | 'close' | 'check' | 'chevronRight' | 'chevronLeft'
  | 'chevronDown' | 'arrowRight' | 'arrowLeft' | 'clock' | 'coins' | 'volume' | 'music'
  | 'vibrate' | 'sun' | 'monitor' | 'accessibility' | 'alert' | 'external' | 'graduationCap'
  | 'flame' | 'ban' | 'trending' | 'target' | 'layers' | 'home' | 'menu'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  /** Suits render as filled glyphs; line icons ignore this. */
  strokeWidth?: number
}

const FILLED = new Set<IconName>(['spade', 'heart', 'diamond', 'club'])

export function Icon({ name, size = 22, strokeWidth = 1.8, className, ...rest }: IconProps) {
  const filled = FILLED.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

// Suit glyph (filled). Used standalone at any size; `red` is caller's concern via text colour.
const PATHS: Record<IconName, JSX.Element> = {
  // ── Suits (filled) ──────────────────────────────────────────────────────────
  spade: <path d="M12 2.5c2.2 3 6.5 5.3 6.5 9.2 0 2.4-1.8 4-4 4-1 0-1.9-.4-2.5-1 .2 1.6.7 2.8 1.8 3.8H10.2c1.1-1 1.6-2.2 1.8-3.8-.6.6-1.5 1-2.5 1-2.2 0-4-1.6-4-4C5.5 7.8 9.8 5.5 12 2.5Z" />,
  heart: <path d="M12 20.5C6 16.6 3.5 13.4 3.5 9.9 3.5 7.2 5.6 5.2 8.2 5.2c1.6 0 3 .8 3.8 2 .8-1.2 2.2-2 3.8-2 2.6 0 4.7 2 4.7 4.7 0 3.5-2.5 6.7-8.5 10.6Z" />,
  diamond: <path d="M12 2.5 20 12l-8 9.5L4 12Z" />,
  club: <path d="M12 2.6c1.9 0 3.5 1.5 3.5 3.5 0 .6-.1 1.1-.4 1.6.5-.3 1.1-.5 1.7-.5 1.9 0 3.5 1.5 3.5 3.5S18.9 14 17 14c-1.2 0-2.3-.6-2.9-1.6.1 1.9.7 3.3 1.9 4.4H10c1.2-1.1 1.8-2.5 1.9-4.4C11.3 13.4 10.2 14 9 14c-1.9 0-3.5-1.4-3.5-3.4S7.1 7.1 9 7.1c.6 0 1.2.2 1.7.5-.2-.5-.4-1-.4-1.6 0-2 1.6-3.4 3.5-3.4Z" transform="translate(1 0)" />,
  // ── Line icons ──────────────────────────────────────────────────────────────
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  cards: <g><rect x="3" y="6" width="11" height="14" rx="2" transform="rotate(-8 8.5 13)" /><rect x="10" y="4" width="11" height="14" rx="2" transform="rotate(8 15.5 11)" /></g>,
  plus: <path d="M12 5v14M5 12h14" />,
  book: <path d="M4 5.5A2 2 0 0 1 6 4h5v15H6a2 2 0 0 0-2 1.5V5.5ZM20 5.5A2 2 0 0 0 18 4h-5v15h5a2 2 0 0 1 2 1.5V5.5Z" />,
  list: <g><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></g>,
  user: <g><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></g>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <g><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.5M12 19v2.5M4.4 7l2.1 1.2M17.5 15.8l2.1 1.2M4.4 17l2.1-1.2M17.5 8.2l2.1-1.2" /></g>,
  search: <g><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></g>,
  lock: <g><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></g>,
  globe: <g><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z" /></g>,
  users: <g><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 20a6.5 6.5 0 0 0-2-4.7" /></g>,
  eye: <g><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></g>,
  shield: <path d="M12 3 5 5.5v5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5v-5L12 3Z" />,
  info: <g><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8h.01" /></g>,
  trophy: <g><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 10M16 5.5h2.5A2.5 2.5 0 0 1 16 10M10 14.5h4M9 20h6M12 14.5V17" /></g>,
  sparkles: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />,
  bot: <g><rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 4.5V8M8.5 13h.01M15.5 13h.01M9 16.5h6" /><path d="M2.5 12.5v3M21.5 12.5v3" /></g>,
  refresh: <path d="M20 11a8 8 0 1 0-.8 4M20 5v6h-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  arrowLeft: <path d="M20 12H4M10 6l-6 6 6 6" />,
  clock: <g><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
  coins: <g><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3" /><path d="M15 10.2c2.9.3 6 1.5 6 3.3 0 1.7-2.7 3-6 3-1.2 0-2.4-.2-3.3-.5" /></g>,
  volume: <path d="M11 5 6.5 9H3v6h3.5L11 19V5ZM15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />,
  music: <g><path d="M9 18V6l10-2v11" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="15" r="2.5" /></g>,
  vibrate: <g><rect x="8.5" y="4" width="7" height="16" rx="1.6" /><path d="M4 9v6M20 9v6" /></g>,
  sun: <g><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.5 1.5M18 18l1.5 1.5M2.5 12h2M19.5 12h2M4.5 19.5 6 18M18 6l1.5-1.5" /></g>,
  monitor: <g><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></g>,
  accessibility: <g><circle cx="12" cy="4.5" r="1.6" /><path d="M5 8.5c2 1 4.5 1.5 7 1.5s5-.5 7-1.5M12 10v4M12 14l-2.5 6M12 14l2.5 6" /></g>,
  alert: <g><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17h.01" /></g>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />,
  graduationCap: <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4ZM6 10.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M21.5 8.5v5" />,
  flame: <path d="M12 3c.5 3-2 4-2 7 0 1.2.6 2 1.4 2.4C11 11 12 10 12 8.5c1.8 1.5 3.5 3.4 3.5 6A5.5 5.5 0 0 1 6.5 15c0-3.8 4-5 5.5-12Z" />,
  ban: <g><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></g>,
  trending: <path d="M3 17l6-6 4 4 8-8M21 7v5M16 7h5" />,
  target: <g><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></g>,
  layers: <path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />,
  home: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
}

// Convenience suit component (filled), with red/black semantics handled by the caller's colour.
export function Suit({ suit, size = 18, className }: { suit: 's' | 'h' | 'd' | 'c'; size?: number; className?: string }) {
  const name: IconName = suit === 's' ? 'spade' : suit === 'h' ? 'heart' : suit === 'd' ? 'diamond' : 'club'
  return <Icon name={name} size={size} className={className} />
}
