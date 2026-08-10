import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import { selectPromoActivities } from '@/lib/tournaments/public/promo'

// A single promo entry, fully resolved server-side (locale-aware strings, href) so the markup below
// is pure presentation — no client JS, no hydration, no layout shift. Fields are kept separate so the
// ticker can style the hierarchy (title > date/location > supporting message).
interface PromoItem {
  href: string
  name: string
  ongoing: boolean
  statusLabel: string
  date: string
  location: string
  message: string
  ariaLabel: string
}

// Cap the ticker so a huge calendar can't bloat the DOM; the soonest activities always win.
const MAX_ITEMS = 8

/**
 * Compact, animated activity-promo strip rendered directly beneath the site header on the home page.
 *
 * Shows ONLY tournaments a Site Admin explicitly opted in (see selectPromoActivities) — never an
 * automatic "what's live" feed. A thin premium band (~64px mobile / 76px desktop) with a real
 * horizontally-running text ticker:
 *   • one promo  → a fixed status badge + a running one-line marquee + a fixed "view details" CTA;
 *     the whole band links to the tournament.
 *   • many promos → a seamless track of per-tournament pills (each its own link with its own CTA),
 *     separated by a ✦, scrolling ongoing→upcoming.
 * Both loop seamlessly (the track holds its content twice; translateX 0 → -50%), pause on hover /
 * keyboard focus, and fall back to a clean static frame under the site-wide prefers-reduced-motion
 * rule. Self-contained async server component: one cheap RLS query, hides itself when nothing is
 * promoted (no empty frame, no CLS).
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
      message: t('tagline'),
      ariaLabel: t('aria_card', { status: statusLabel, name: a.name }),
    }
  })

  return (
    <section aria-label={t('aria_region')} className="pt-5 sm:pt-6">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {items.length === 1 ? (
          <SoloTicker item={items[0]} ctaLabel={t('cta_detail')} />
        ) : (
          <MultiTicker items={items} ctaLabel={t('cta_detail')} />
        )}
      </div>
    </section>
  )
}

// Shared shell classes for both variants — thin band, brand blush→gold gradient, soft shadow.
const SHELL =
  'promo-strip group relative flex h-[64px] items-center overflow-hidden rounded-2xl border border-rose/15 ' +
  'bg-[linear-gradient(105deg,#fbedf3_0%,#fffdf8_50%,#f6eacf_100%)] shadow-[0_8px_28px_-14px_rgba(157,18,72,0.3)] sm:h-[76px]'

// Fade both edges so the running text melts in/out rather than popping at the border.
const FADE = 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent)'
const maskStyle: CSSProperties = { maskImage: FADE, WebkitMaskImage: FADE }

// Rough seconds-per-run from text length so long lines don't whip past and short ones don't crawl.
function durationFor(chars: number): string {
  return `${Math.min(Math.max(chars * 0.26, 16), 46)}s`
}

// ── Single activity: fixed status (left) + running marquee (centre) + fixed CTA (right) ──────────
// The whole band is ONE link → no nested anchors. Only the centre line scrolls; the status pill and
// CTA stay put so the click target and status never drift off-screen.
function SoloTicker({ item, ctaLabel }: { item: PromoItem; ctaLabel: string }) {
  const line = [item.name, item.date, item.location, item.message].filter(Boolean)
  const chars = line.join('   ·   ').length
  const durStyle = { '--promo-dur': durationFor(chars + 8) } as CSSProperties

  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className={`${SHELL} gap-3 px-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-rose/25 hover:shadow-[0_16px_40px_-18px_rgba(157,18,72,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:gap-4 sm:px-5`}
    >
      <span className="relative z-[1] hidden h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-rose to-rose-deep text-white shadow-[0_8px_18px_-8px_rgba(157,18,72,0.6)] sm:flex">
        <TrophyIcon />
      </span>
      <StatusPill ongoing={item.ongoing} label={item.statusLabel} className="relative z-[1]" />

      {/* Running centre line. The track holds the content twice for a seamless loop; the clone half is
          aria-hidden so assistive tech reads the promo exactly once. */}
      <div className="relative z-[1] h-full min-w-0 flex-1 overflow-hidden" style={maskStyle}>
        <div className="promo-ticker-track flex h-full w-max items-center" style={durStyle}>
          <SoloLine item={item} />
          <SoloLine item={item} aria-hidden />
        </div>
      </div>

      {/* Fixed CTA — collapses to a tappable arrow chip on phones so the line has room. */}
      <span className="relative z-[1] inline-flex h-9 w-9 flex-none items-center justify-center gap-1.5 rounded-full bg-rose text-[12.5px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(194,24,91,0.6)] transition-colors group-hover:bg-rose-deep sm:h-auto sm:w-auto sm:px-4 sm:py-2">
        <span className="hidden sm:inline">{ctaLabel}</span>
        <ArrowIcon />
      </span>
    </Link>
  )
}

// One copy of the single-promo line. `aria-hidden` marks the duplicated (loop) copy.
function SoloLine({ item, 'aria-hidden': ariaHidden }: { item: PromoItem; 'aria-hidden'?: boolean }) {
  return (
    <span className="flex items-center whitespace-nowrap pr-10" aria-hidden={ariaHidden}>
      <span className="font-serif text-[15px] font-bold tracking-[-0.2px] text-ink sm:text-[16.5px]">{item.name}</span>
      <Dot />
      <span className="text-[12.5px] font-medium text-[#6a5a4e] sm:text-[13px]">{item.date}</span>
      {item.location && (
        <>
          <Dot />
          <span className="text-[12.5px] text-[#7a6a5e] sm:text-[13px]">{item.location}</span>
        </>
      )}
      <Dot />
      <span className="text-[12.5px] text-[#8a7a6e] sm:text-[13px]">{item.message}</span>
    </span>
  )
}

// ── Several activities: a seamless track of per-tournament pills, ✦-separated ────────────────────
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
    <div className={`${SHELL} px-0`}>
      <div className="relative h-full w-full overflow-hidden" style={maskStyle}>
        <ul className="promo-ticker-track absolute inset-y-0 left-0 flex h-full w-max list-none items-center pl-4" style={durStyle}>
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
      <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-rose px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors group-hover/pill:bg-rose-deep">
        {ctaLabel}
        <ArrowIcon />
      </span>
    </>
  )
  const shared =
    'inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-rose/12 bg-white/70 py-1.5 pl-2.5 pr-1.5 shadow-[0_2px_10px_-4px_rgba(157,18,72,0.18)]'
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

function StatusPill({ ongoing, label, className = '' }: { ongoing: boolean; label: string; className?: string }) {
  return (
    <span
      className={`${
        ongoing
          ? 'inline-flex flex-none items-center gap-1.5 rounded-full border border-teal/30 bg-teal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-teal'
          : 'inline-flex flex-none items-center gap-1.5 rounded-full border border-rose/25 bg-rose-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-rose'
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
function Dot() {
  return <span aria-hidden="true" className="mx-2 text-rose/40 sm:mx-2.5">·</span>
}
// A brand accent star between promos in the multi ticker (decorative).
function Star() {
  return <span aria-hidden="true" className="mx-3 text-[13px] text-rose/45 sm:mx-4">✦</span>
}

function TrophyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}
function ArrowIcon() {
  return (
    <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover/pill:translate-x-0.5 motion-reduce:transition-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}
