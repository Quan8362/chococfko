import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

export const metadata = { title: 'Mini Game' }

/* ── Crafted per-game SVG icons ──────────────────────────────────────────────
   Each icon is a clean, self-contained vector that sits on its game's accent-
   tinted background (see GAMES[].iconBg). Replaces the old emoji/placeholders. */
const ICONS: Record<string, ReactNode> = {
  // JLPT — kana あ in the brand serif
  jp60: (
    <span className="font-serif font-bold text-[26px] leading-none text-gold">あ</span>
  ),

  // Lucky wheel — 4-segment spinner with hub + pointer
  random_wheel: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 16 16 4 A12 12 0 0 1 28 16 Z" fill="#c2185b" />
      <path d="M16 16 28 16 A12 12 0 0 1 16 28 Z" fill="#f4c4d6" />
      <path d="M16 16 16 28 A12 12 0 0 1 4 16 Z" fill="#c2185b" />
      <path d="M16 16 4 16 A12 12 0 0 1 16 4 Z" fill="#f4c4d6" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3" fill="#fff" stroke="#9d1248" strokeWidth="1.3" />
      <path d="M16 1 19.2 5.6 12.8 5.6 Z" fill="#9d1248" />
    </svg>
  ),

  // Destination — map pin inside a dashed "route" ring
  destination_wheel: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12.5" fill="#fff" stroke="#1f8fa6" strokeWidth="1.5" strokeDasharray="3 2.6" />
      <path d="M16 8 a5.2 5.2 0 0 1 5.2 5.2 c0 3.7-5.2 9.4-5.2 9.4 s-5.2-5.7-5.2-9.4 A5.2 5.2 0 0 1 16 8 Z" fill="#1f8fa6" />
      <circle cx="16" cy="13.2" r="1.9" fill="#fff" />
    </svg>
  ),

  // Sudoku — 9-cell grid, violet/teal/gold cells
  sudoku: (
    <svg width="30" height="30" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1"  y="1"  width="7" height="7" rx="1.6" fill="#6d5ae6" />
      <rect x="10.5" y="1"  width="7" height="7" rx="1.6" fill="#c7bff8" />
      <rect x="20" y="1"  width="7" height="7" rx="1.6" fill="#9b8cf0" />
      <rect x="1"  y="10.5" width="7" height="7" rx="1.6" fill="#9b8cf0" />
      <rect x="10.5" y="10.5" width="7" height="7" rx="1.6" fill="#6d5ae6" />
      <rect x="20" y="10.5" width="7" height="7" rx="1.6" fill="#c7bff8" />
      <rect x="1"  y="20" width="7" height="7" rx="1.6" fill="#c7bff8" />
      <rect x="10.5" y="20" width="7" height="7" rx="1.6" fill="#9b8cf0" />
      <rect x="20" y="20" width="7" height="7" rx="1.6" fill="#6d5ae6" />
    </svg>
  ),

  // Cờ Caro — board grid with X / O marks
  caro: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="#c2cad9" strokeWidth="1.4" strokeLinecap="round">
        <path d="M12 4 V28 M21 4 V28 M4 12 H28 M4 21 H28" />
      </g>
      <g stroke="#c2185b" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5.5 5.5 10.5 10.5 M10.5 5.5 5.5 10.5" />
        <path d="M21.5 21.5 26.5 26.5 M26.5 21.5 21.5 26.5" />
      </g>
      <circle cx="16.5" cy="16.5" r="3" fill="none" stroke="#3b4a6b" strokeWidth="2.2" />
    </svg>
  ),

  // Cờ Tướng — round xiangqi piece (帥)
  chinese_chess: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#fff" stroke="#c0392b" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#c0392b" strokeWidth="1" />
      <text x="16" y="20.8" textAnchor="middle" fontFamily="var(--font-serif-display), serif" fontSize="13.5" fontWeight="700" fill="#c0392b">帥</text>
    </svg>
  ),

  // Tiến Lên — two fanned playing cards (♠ back, ♥ front)  // TODO(asset): refine card art
  tlmn: (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <g transform="rotate(-15 18 22)">
        <rect x="6.5" y="9" width="14" height="19.5" rx="2.4" fill="#fff" stroke="#c99a3d" strokeWidth="1.3" />
        <path d="M13.5 14 c-2 2.4-3.9 3.5-3.9 5.1 c0 1.1.9 1.8 1.9 1.8 c.5 0 1-.2 1.3-.5 c-.2 1-.6 1.6-1.3 2.2 h4 c-.7-.6-1.1-1.2-1.3-2.2 c.3.3.8.5 1.3.5 c1 0 1.9-.7 1.9-1.8 c0-1.6-1.9-2.7-3.9-5.1 Z" fill="#2a2f3a" />
      </g>
      <g transform="rotate(13 18 22)">
        <rect x="15" y="7" width="14" height="20" rx="2.4" fill="#fff" stroke="#d1304f" strokeWidth="1.3" />
        <path d="M22 20.2 c-2.7-1.9-4.4-3.5-4.4-5.4 c0-1.4 1.05-2.2 2.2-2.2 c.9 0 1.65.5 2.2 1.35 c.55-.85 1.3-1.35 2.2-1.35 c1.15 0 2.2.8 2.2 2.2 c0 1.9-1.7 3.5-4.4 5.4 Z" fill="#d1304f" />
        <text x="17.6" y="12.2" textAnchor="middle" fontFamily="var(--font-serif-display), serif" fontSize="5.4" fontWeight="700" fill="#d1304f">A</text>
      </g>
    </svg>
  ),

  // Dò mìn — mine with spikes + a flag
  minesweeper: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="#1f2a24" strokeWidth="2.3" strokeLinecap="round">
        <path d="M15 8 V26 M6 17 H24 M9 11 21.5 22.5 M21.5 11.5 9 23" />
      </g>
      <circle cx="15" cy="17" r="6.6" fill="#1f2a24" />
      <circle cx="12.8" cy="14.8" r="1.7" fill="#fff" opacity="0.65" />
      <path d="M24 6 V15" stroke="#10a36a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24 6 29 8 24 10 Z" fill="#10a36a" />
    </svg>
  ),

  // 2048 — four number tiles
  game2048: (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <g fontFamily="var(--font-bvp), system-ui, sans-serif" fontWeight="700" textAnchor="middle">
        <rect x="1.5" y="1.5" width="12.5" height="12.5" rx="2.6" fill="#f3ddc1" />
        <text x="7.75" y="11" fontSize="7" fill="#8a5a1e">2</text>
        <rect x="16" y="1.5" width="12.5" height="12.5" rx="2.6" fill="#f1c08a" />
        <text x="22.25" y="11" fontSize="7" fill="#8a4a12">4</text>
        <rect x="1.5" y="16" width="12.5" height="12.5" rx="2.6" fill="#ef9d52" />
        <text x="7.75" y="25.4" fontSize="7" fill="#fff">8</text>
        <rect x="16" y="16" width="12.5" height="12.5" rx="2.6" fill="#e8762a" />
        <text x="22.25" y="25.2" fontSize="5.6" fill="#fff">16</text>
      </g>
    </svg>
  ),

  // Kẹo Ngọt — wrapped candy
  match3: (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M9 16 4 10.5 V21.5 Z" fill="#e0457b" />
      <path d="M23 16 28 10.5 V21.5 Z" fill="#e0457b" />
      <circle cx="16" cy="16" r="7.2" fill="#f06aa0" />
      <circle cx="16" cy="16" r="4" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.85" />
      <circle cx="13" cy="13" r="1.5" fill="#fff" opacity="0.7" />
    </svg>
  ),
}

type Tone = 'jlpt' | 'new' | 'hot' | 'moi'
type Meta = 'solo' | 'group' | 'bolt'

const TONE_STYLES: Record<Tone, string> = {
  jlpt: 'bg-gradient-to-r from-amber-400 to-gold text-white shadow-[0_2px_8px_-2px_rgba(201,154,61,0.5)]',
  new: 'bg-gradient-to-r from-teal to-emerald-600 text-white shadow-[0_2px_8px_-2px_rgba(31,143,166,0.5)]',
  hot: 'bg-gradient-to-r from-amber-500 to-rose text-white shadow-[0_2px_9px_-2px_rgba(225,29,72,0.55)]',
  moi: 'bg-gradient-to-r from-rose to-fuchsia-600 text-white shadow-[0_2px_8px_-2px_rgba(192,38,211,0.5)]',
}

function MetaIcon({ type }: { type: Meta }) {
  if (type === 'bolt') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  }
  if (type === 'group') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

export default async function GamesPage() {
  const t = await getTranslations('games')

  const GAMES: {
    id: string
    href: string
    ns: string
    tone: Tone
    meta: Meta
    players: string
    accent: string
    iconBg: string
    glow: string
  }[] = [
    { id: 'jp60', href: '/games/japanese-60', ns: 'jp60', tone: 'jlpt', meta: 'bolt', players: t('jp60.solo'), accent: '#c99a3d', iconBg: 'linear-gradient(140deg,#fdf6e6,#f3e2b8)', glow: 'rgba(201,154,61,0.4)' },
    { id: 'random_wheel', href: '/games/random-wheel', ns: 'random_wheel', tone: 'new', meta: 'group', players: t('random_wheel.solo'), accent: '#c2185b', iconBg: 'linear-gradient(140deg,#fcecf2,#f7d3e0)', glow: 'rgba(194,24,91,0.38)' },
    { id: 'destination_wheel', href: '/games/destination-wheel', ns: 'destination_wheel', tone: 'new', meta: 'solo', players: t('destination_wheel.solo'), accent: '#1f8fa6', iconBg: 'linear-gradient(140deg,#e4f4f7,#cdeaef)', glow: 'rgba(31,143,166,0.38)' },
    { id: 'sudoku', href: '/games/sudoku', ns: 'sudoku', tone: 'new', meta: 'solo', players: t('sudoku.solo'), accent: '#6d5ae6', iconBg: 'linear-gradient(140deg,#efecfd,#ddd6fa)', glow: 'rgba(109,90,230,0.38)' },
    { id: 'caro', href: '/games/caro', ns: 'caro', tone: 'hot', meta: 'group', players: t('players_label', { n: 2 }), accent: '#3b4a6b', iconBg: 'linear-gradient(140deg,#eef1f6,#dbe1ec)', glow: 'rgba(59,74,107,0.4)' },
    { id: 'chinese_chess', href: '/games/chinese-chess', ns: 'chinese_chess', tone: 'hot', meta: 'group', players: t('players_label', { n: 2 }), accent: '#c0392b', iconBg: 'linear-gradient(140deg,#fdeceb,#f7d2cd)', glow: 'rgba(192,57,43,0.4)' },
    { id: 'tlmn', href: '/games/tlmn', ns: 'tlmn', tone: 'moi', meta: 'group', players: t('tlmn.players'), accent: '#d1304f', iconBg: 'linear-gradient(140deg,#fceef0,#f8dce1)', glow: 'rgba(209,48,79,0.42)' },
    { id: 'minesweeper', href: '/games/minesweeper', ns: 'minesweeper', tone: 'new', meta: 'solo', players: t('destination_wheel.solo'), accent: '#10a36a', iconBg: 'linear-gradient(140deg,#e6f6ef,#cfeede)', glow: 'rgba(16,163,106,0.38)' },
    { id: 'game2048', href: '/games/2048', ns: 'game2048', tone: 'new', meta: 'solo', players: t('game2048.solo'), accent: '#ef7d20', iconBg: 'linear-gradient(140deg,#fdf0e4,#fbddc1)', glow: 'rgba(239,125,32,0.4)' },
    { id: 'match3', href: '/games/match-3', ns: 'match3', tone: 'new', meta: 'solo', players: t('match3.solo'), accent: '#e0457b', iconBg: 'linear-gradient(140deg,#fceaf1,#f8d3e2)', glow: 'rgba(224,69,123,0.4)' },
  ]

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Header band — playful game-motif texture over a warm gradient */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-rose-soft via-paper to-gold-light/50 px-6 py-8 sm:px-10 sm:py-11 mb-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.55]">
          <span className="absolute top-6 right-8 w-20 h-20 rounded-full bg-rose/10 blur-2xl" />
          <span className="absolute -bottom-6 right-28 w-24 h-24 rounded-full bg-gold/15 blur-2xl" />
          <svg className="absolute top-5 right-6 w-8 h-8 text-rose/25 animate-float" fill="currentColor" viewBox="0 0 24 24" style={{ animationDelay: '0s' }} aria-hidden="true">
            <path d="M12 2 14.6 8.6 21.6 9.2 16.3 13.8 18 20.7 12 17 6 20.7 7.7 13.8 2.4 9.2 9.4 8.6 Z" />
          </svg>
          <svg className="absolute top-16 right-24 w-5 h-5 text-teal/30 animate-float" viewBox="0 0 24 24" fill="currentColor" style={{ animationDelay: '1.2s' }} aria-hidden="true">
            <circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="12" cy="12" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="18" r="2.4" />
          </svg>
          <svg className="absolute bottom-6 right-12 w-6 h-6 text-gold/35 animate-float" viewBox="0 0 24 24" fill="currentColor" style={{ animationDelay: '0.6s' }} aria-hidden="true">
            <path d="M12 21s-6.7-4.3-9.2-8.4C1 9.6 2.6 5.5 6.3 5.5c2 0 3.4 1.1 4.2 2.4l1.5 2.3 1.5-2.3c.8-1.3 2.2-2.4 4.2-2.4 3.7 0 5.3 4.1 3.5 7.1C18.7 16.7 12 21 12 21Z" />
          </svg>
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-paper/80 border border-rose/25 px-3 py-1.5 rounded-full mb-4 shadow-sm">
            {t('page_badge')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(28px,4vw,44px)] leading-tight tracking-[-0.4px] text-ink mb-2">
            {t('page_heading')}
          </h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-[540px]">
            {t('page_desc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {GAMES.map((g) => (
          <Link
            key={g.id}
            href={g.href}
            style={{ ['--glow' as string]: g.glow, ['--accent' as string]: g.accent }}
            className="group relative overflow-hidden bg-paper border border-line rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[0_18px_40px_-16px_var(--glow)]"
          >
            {/* accent top strip */}
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] opacity-60 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, ${g.accent}, transparent 85%)` }} />
            {/* soft accent glow that wakes up on hover */}
            <span aria-hidden="true" className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" style={{ background: g.accent }} />

            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ring-1 ring-black/[0.04] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
                  style={{ background: g.iconBg }}
                >
                  {ICONS[g.id]}
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide ${TONE_STYLES[g.tone]}`}>
                  {t(`${g.ns}.tag`)}
                </span>
              </div>
              <h2 className="font-serif font-bold text-[17.5px] text-ink mb-1.5 group-hover:text-rose transition-colors">
                {t(`${g.ns}.title`)}
              </h2>
              <p className="text-[13px] text-muted leading-relaxed mb-3 line-clamp-2">{t(`${g.ns}.short_desc`)}</p>
              <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted/80 bg-cream/70 border border-line/70 rounded-full px-2.5 py-1">
                <MetaIcon type={g.meta} />
                {g.players}
              </div>
            </div>
          </Link>
        ))}

        {/* Inviting "more games coming" placeholder */}
        <div className="group relative overflow-hidden rounded-2xl border border-dashed border-line bg-gradient-to-br from-cream/60 to-paper flex flex-col items-center justify-center text-center gap-2.5 p-5 min-h-[176px]">
          <div className="w-12 h-12 rounded-2xl bg-paper border border-line flex items-center justify-center text-muted/60 transition-transform duration-300 group-hover:scale-105">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="22" height="22" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3.4 3" />
              <path d="M14 9 V19 M9 14 H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[13px] text-muted/70 font-medium max-w-[180px]">{t('coming_soon')}</p>
        </div>
      </div>
    </div>
  )
}
