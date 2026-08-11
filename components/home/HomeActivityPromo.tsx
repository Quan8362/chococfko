import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import { selectPromoActivities } from '@/lib/tournaments/public/promo'

// A single promo entry, fully resolved server-side (locale-aware strings, href) so the markup below
// is pure presentation — no client JS, no hydration, no layout shift. Fields are kept separate so the
// card can style a clear hierarchy: title > date/location/events (meta) > tagline (supporting).
interface PromoItem {
  href: string
  name: string
  ongoing: boolean
  statusLabel: string
  date: string
  location: string
  events: string
  ariaLabel: string
}

// Cap the ticker so a huge calendar can't bloat the DOM; the soonest activities always win.
const MAX_ITEMS = 8

/**
 * Compact, premium activity-promo strip rendered directly beneath the site header on the home page.
 *
 * Shows ONLY tournaments a Site Admin explicitly opted in (see selectPromoActivities) — never an
 * automatic "what's live" feed. Two presentations, both a thin blush→pearl band with a rose emblem:
 *   • one promo  → a STATIC card with a strict hierarchy (emblem · status · title · meta · CTA). No
 *     marquee, so nothing scrolls, is clipped, or drifts. On phones it reflows to a clean stacked
 *     layout; on desktop it sits on one balanced row.
 *   • many promos → a seamless marquee of self-contained per-tournament pills (each its own link with
 *     its own CTA), separated by a ✦, scrolling ongoing→upcoming; pills are whole units so nothing is
 *     ever caught mid-word. Pauses on hover / keyboard focus and falls back to a static frame under
 *     prefers-reduced-motion.
 * Self-contained async server component: one cheap RLS query, hides itself when nothing is promoted
 * (no empty frame, no CLS).
 */
export default async function HomeActivityPromo() {
  const active = selectPromoActivities(await listPublicTournaments()).slice(0, MAX_ITEMS)
  if (active.length === 0) return null // nothing promoted → no empty frame

  const [t, locale] = await Promise.all([getTranslations('home_promo'), getLocale()])
  const items: PromoItem[] = active.map((a) => {
    const ongoing = a.phase === 'ongoing'
    const statusLabel = ongoing ? t('status_ongoing') : t('status_upcoming')
    return {
      href: `/giai-dau/${a.slug}`,
      name: a.name,
      ongoing,
      statusLabel,
      date: formatDateRange(a.startsAt, a.endsAt, locale) || t('date_tbd'),
      location: a.location ?? '',
      events: a.eventCount > 0 ? t('events_count', { count: a.eventCount }) : '',
      ariaLabel: t('aria_card', { status: statusLabel, name: a.name }),
    }
  })

  return (
    <section aria-label={t('aria_region')} className="pt-5 sm:pt-6">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {items.length === 1 ? (
          <SoloCard item={items[0]} ctaLabel={t('cta_detail')} />
        ) : (
          <MultiTicker items={items} ctaLabel={t('cta_detail')} />
        )}
      </div>
    </section>
  )
}

// Shared shell classes — a compact premium band: brand blush→pearl gradient, crisp rose hairline,
// a soft branded drop-shadow and an inset top highlight so the strip reads like a lit, slightly
// glassy surface rather than a flat rectangle. No gold anywhere — pure blush/rose/ivory.
const SHELL =
  'promo-strip group relative overflow-hidden rounded-2xl border border-rose/15 ' +
  'bg-[linear-gradient(105deg,#fdeef4_0%,#fffdfb_50%,#fbe7f0_100%)] ' +
  'shadow-[0_10px_30px_-16px_rgba(157,18,72,0.32),0_2px_6px_-3px_rgba(157,18,72,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]'

// A soft light sheen laid over the band for depth (decorative, pointer-events off). Sits under the
// content (z-0) so text/CTA stay crisp above it. Blush/rose tints only.
function Sheen() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(255,255,255,0.75),transparent_46%),radial-gradient(130%_150%_at_100%_100%,rgba(194,24,91,0.07),transparent_52%)]"
    />
  )
}

// Fade both edges of the marquee so the running pills melt in/out rather than popping at the border.
const FADE = 'linear-gradient(to right, transparent, #000 5%, #000 95%, transparent)'
const maskStyle: CSSProperties = { maskImage: FADE, WebkitMaskImage: FADE }

// ── Single activity: a STATIC hierarchical card (no marquee) ─────────────────────────────────────
// The whole card is ONE link → no nested anchors. The inner content is aria-hidden because the link
// itself carries a full accessible label; the CTA/status/title are purely visual.
//
// Desktop: emblem · status · [title over meta, flex-1] · CTA, all on one balanced row.
// Mobile:  a clean stacked layout — top row (emblem + status, CTA pinned right), then title, then meta.
function SoloCard({ item, ctaLabel }: { item: PromoItem; ctaLabel: string }) {
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className={`${SHELL} block px-3.5 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-rose/25 hover:shadow-[0_18px_44px_-18px_rgba(157,18,72,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:px-4 sm:py-0`}
    >
      <div aria-hidden="true" className="relative z-[1] flex flex-col gap-2 sm:h-[76px] sm:flex-row sm:items-center sm:gap-4">
        {/* Top zone. On mobile this is a full-width row with the CTA pinned right; on desktop it
            dissolves (`sm:contents`) so the emblem + status flow into the main row. */}
        <div className="flex items-center gap-2.5 sm:contents">
          <PromoBadge className="flex-none" />
          <StatusPill ongoing={item.ongoing} label={item.statusLabel} />
          {/* Mobile-only CTA: a premium arrow-circle pinned right (inset by the card's padding, so it
              never touches the edge). Circle keeps the top row narrow so nothing overflows on phones. */}
          <span className="ml-auto flex-none sm:hidden">
            <CtaButton label={ctaLabel} iconOnly />
          </span>
        </div>

        {/* Title + meta. `min-w-0` lets both lines truncate cleanly instead of overflowing. */}
        <div className="min-w-0 sm:flex-1">
          <p className="truncate font-serif text-[15.5px] font-bold leading-tight tracking-[-0.2px] text-ink sm:text-[17px]">
            {item.name}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium leading-tight text-[#7a6a5e] sm:text-[12.5px]">
            <span className="text-[#5f5148]">{item.date}</span>
            {item.location && (
              <>
                <MetaDot />
                {item.location}
              </>
            )}
            {item.events && (
              <>
                <MetaDot />
                {item.events}
              </>
            )}
          </p>
        </div>

        {/* Desktop-only CTA at the end of the row. */}
        <span className="hidden flex-none sm:block">
          <CtaButton label={ctaLabel} />
        </span>
      </div>
      <Sheen />
    </Link>
  )
}

// ── Several activities: a seamless marquee of per-tournament pills, ✦-separated ───────────────────
function MultiTicker({ items, ctaLabel }: { items: PromoItem[]; ctaLabel: string }) {
  // Unhurried, readable: ~9s per pill, floored so a 2-pill strip still drifts gently.
  const durStyle = { '--promo-dur': `${Math.max(items.length * 9, 22)}s` } as CSSProperties

  const sequence = (clone: boolean) =>
    items.map((item, i) => (
      <li key={`${clone ? 'b' : 'a'}-${i}`} className="flex items-center" aria-hidden={clone ? true : undefined}>
        <PromoPill item={item} ctaLabel={ctaLabel} clone={clone} />
        <Star />
      </li>
    ))

  return (
    <div className={`${SHELL} flex h-[64px] items-center gap-3 pl-3.5 sm:h-[76px] sm:gap-4 sm:pl-4`}>
      <Sheen />
      {/* Fixed leading emblem so the multi-strip carries the same premium anchor as the solo card. */}
      <PromoBadge className="hidden flex-none sm:flex" />
      <div className="relative z-[1] h-full min-w-0 flex-1 overflow-hidden" style={maskStyle}>
        <ul className="promo-ticker-track absolute inset-y-0 left-0 flex h-full w-max list-none items-center" style={durStyle}>
          {sequence(false)}
          {/* Duplicate copy purely for the seamless loop — hidden from assistive tech + non-interactive. */}
          {sequence(true)}
        </ul>
      </div>
    </div>
  )
}

function PromoPill({ item, ctaLabel, clone = false }: { item: PromoItem; ctaLabel: string; clone?: boolean }) {
  const inner = (
    <>
      <StatusPill ongoing={item.ongoing} label={item.statusLabel} />
      <span className="font-serif text-[14px] font-bold tracking-[-0.2px] text-ink">{item.name}</span>
      <span className="text-[12px] text-[#6a5a4e]">{item.date}</span>
      {item.location && <span className="text-[12px] text-[#7a6a5e]">{item.location}</span>}
      <CtaButton label={ctaLabel} size="sm" className="ml-0.5" />
    </>
  )
  const shared =
    'inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-rose/12 bg-white/80 py-1.5 pl-2.5 pr-1.5 shadow-[0_3px_12px_-4px_rgba(157,18,72,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm'
  if (clone) {
    // Non-interactive, non-focusable, invisible to assistive tech — exists only to fill the loop.
    return (
      <span className={`${shared} pointer-events-none`} tabIndex={-1}>
        {inner}
      </span>
    )
  }
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className={`group/pill ${shared} transition-colors hover:border-rose/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream`}
    >
      {inner}
    </Link>
  )
}

// Shared CTA — a gradient rose pill. `iconOnly` renders a compact arrow-circle (mobile solo card);
// the `sm` size is a touch smaller (marquee pills). Rendered as a <span> so it never nests an anchor.
function CtaButton({
  label,
  className = '',
  size = 'md',
  iconOnly = false,
}: {
  label: string
  className?: string
  size?: 'md' | 'sm'
  iconOnly?: boolean
}) {
  const dims = iconOnly
    ? 'h-8 w-8'
    : size === 'sm'
      ? 'gap-1 px-2.5 py-1 text-[11.5px]'
      : 'gap-1.5 px-3.5 py-1.5 text-[12.5px] sm:px-4 sm:py-2'
  return (
    <span
      className={`relative z-[1] inline-flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(120deg,#c2185b,#9d1248)] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(157,18,72,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/15 transition-all duration-300 group-hover:shadow-[0_12px_24px_-8px_rgba(157,18,72,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] group-hover:brightness-110 group-hover/pill:brightness-110 ${dims} ${className}`}
    >
      {!iconOnly && label}
      <ArrowIcon />
    </span>
  )
}

function StatusPill({ ongoing, label, className = '' }: { ongoing: boolean; label: string; className?: string }) {
  return (
    <span
      className={`${
        ongoing
          ? 'inline-flex flex-none items-center gap-1.5 rounded-full border border-teal/30 bg-[linear-gradient(180deg,#f0fafb,#dbeef1)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-teal shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_-1px_rgba(31,143,166,0.25)]'
          : 'inline-flex flex-none items-center gap-1.5 rounded-full border border-rose/25 bg-[linear-gradient(180deg,#fdf1f6,#fbe2ec)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-rose shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_3px_-1px_rgba(194,24,91,0.25)]'
      } ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {ongoing && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${ongoing ? 'bg-teal' : 'bg-rose'}`} />
      </span>
      {label}
    </span>
  )
}

// A subtle metadata dot separator (decorative).
function MetaDot() {
  return <span aria-hidden="true" className="mx-1.5 text-rose/40">·</span>
}
// A brand accent star between promos in the multi ticker (decorative).
function Star() {
  return <span aria-hidden="true" className="mx-3 text-[13px] text-rose/45 sm:mx-4">✦</span>
}

/**
 * Premium "featured event" emblem shown as the strip's left anchor. A self-contained SVG so it stays
 * razor-sharp at any DPI: a soft pearl-blush seal (radial + linear light-rose gradients with a
 * highlight cap and a rose bevel ring) carrying a gradient-filled rose trophy and two sparkles. All
 * depth comes from layered vector shapes — no flat "default icon" feel, no off-tone gold. Purely
 * decorative (aria-hidden) — the surrounding link carries the accessible label.
 */
function PromoBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`relative z-[1] h-10 w-10 sm:h-11 sm:w-11 ${className}`}>
      <svg
        viewBox="0 0 44 44"
        className="h-full w-full drop-shadow-[0_5px_11px_rgba(157,18,72,0.28)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="promoSeal" x1="6" y1="4" x2="38" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#fbdcea" />
            <stop offset="1" stopColor="#f2b9d1" />
          </linearGradient>
          <radialGradient id="promoSealGlow" cx="0.32" cy="0.24" r="0.85">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="promoCup" x1="16" y1="12" x2="28" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#d61f66" />
            <stop offset="1" stopColor="#9d1248" />
          </linearGradient>
        </defs>

        {/* Domed seal: base gradient, top-light glow, and soft bevel rings for depth. */}
        <rect x="2" y="2" width="40" height="40" rx="13" fill="url(#promoSeal)" />
        <rect x="2" y="2" width="40" height="40" rx="13" fill="url(#promoSealGlow)" />
        <rect x="3.4" y="3.4" width="37.2" height="37.2" rx="11.5" fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1" />
        <rect x="2.5" y="2.5" width="39" height="39" rx="12.6" fill="none" stroke="#c2185b" strokeOpacity="0.28" strokeWidth="1" />

        {/* Rose trophy (heroicons solid), centred and gradient-filled. */}
        <g transform="translate(11.05 10.6) scale(0.915)" fill="url(#promoCup)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15.75a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337c.663-.128 1.331-.243 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z"
          />
        </g>

        {/* Sparkles — a bright four-point star top-right and a smaller one lower-left. */}
        <path d="M33 8.2c.5 1.7.9 2.1 2.6 2.6-1.7.5-2.1.9-2.6 2.6-.5-1.7-.9-2.1-2.6-2.6 1.7-.5 2.1-.9 2.6-2.6Z" fill="#ffffff" />
        <path d="M10.6 30.5c.34 1.15.6 1.41 1.75 1.75-1.15.34-1.41.6-1.75 1.75-.34-1.15-.6-1.41-1.75-1.75 1.15-.34 1.41-.6 1.75-1.75Z" fill="#ffffff" fillOpacity="0.85" />
      </svg>
    </span>
  )
}

function ArrowIcon() {
  return (
    <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover/pill:translate-x-0.5 motion-reduce:transition-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}
