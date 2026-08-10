import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPublicTournaments } from '@/lib/tournaments/public/queries'
import { formatDateRange } from '@/lib/tournaments/public/format'
import { selectPromoActivities } from '@/lib/tournaments/public/promo'

// A single promo entry, fully resolved server-side (locale-aware strings, href) so the markup below
// is pure presentation — no client JS, no hydration, no layout shift.
interface PromoItem {
  href: string
  name: string
  ongoing: boolean
  statusLabel: string
  meta: string // "date · location · N events" (empty segments already dropped)
  ariaLabel: string
}

// Cap the ticker so a huge calendar can't bloat the DOM; the soonest activities always win.
const MAX_ITEMS = 8

/**
 * Compact, animated activity promo strip rendered directly beneath the site header on the home page.
 *
 * A thin premium band (~76px desktop) that promotes live/upcoming community activities (today:
 * tournaments). One activity → a still card with a slow light sheen; several → a seamless
 * auto-scrolling ticker that pauses on hover/focus. All motion is pure CSS and is neutralised by the
 * site-wide `prefers-reduced-motion` rule (each base state is the intended still frame). Self-contained
 * async server component: one cheap RLS query, hides itself when nothing is live/upcoming.
 */
export default async function HomeActivityPromo() {
  const active = selectPromoActivities(await listPublicTournaments()).slice(0, MAX_ITEMS)
  if (active.length === 0) return null // nothing live/upcoming → no empty frame

  const [t, locale] = await Promise.all([getTranslations('home_promo'), getLocale()])
  const items: PromoItem[] = active.map((a) => {
    const ongoing = a.phase === 'ongoing'
    const statusLabel = ongoing ? t('status_ongoing') : t('status_upcoming')
    const meta = [
      formatDateRange(a.startsAt, a.endsAt, locale) || t('date_tbd'),
      a.location ?? '',
      a.eventCount > 0 ? t('events_count', { count: a.eventCount }) : '',
    ]
      .filter(Boolean)
      .join('  ·  ')
    return {
      href: `/giai-dau/${a.slug}`,
      name: a.name,
      ongoing,
      statusLabel,
      meta,
      ariaLabel: t('aria_card', { status: statusLabel, name: a.name }),
    }
  })

  return (
    <section aria-label={t('aria_region')} className="pt-5 sm:pt-6">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {items.length === 1 ? (
          <SoloStrip item={items[0]} ctaLabel={t('cta_detail')} />
        ) : (
          <TickerStrip items={items} ctaLabel={t('cta_detail')} />
        )}
      </div>
    </section>
  )
}

// Shared shell classes for both strip variants — thin band, brand blush→gold gradient, soft shadow.
const SHELL =
  'promo-strip group relative flex h-[64px] items-center overflow-hidden rounded-2xl border border-rose/15 ' +
  'bg-[linear-gradient(105deg,#fbedf3_0%,#fffdf8_50%,#f6eacf_100%)] shadow-[0_8px_28px_-14px_rgba(157,18,72,0.3)] sm:h-[76px]'

// ── Single activity: a still card with a slow sheen; the whole band is one link ──────────────────
function SoloStrip({ item, ctaLabel }: { item: PromoItem; ctaLabel: string }) {
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className={`${SHELL} gap-3 px-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-rose/25 hover:shadow-[0_16px_40px_-18px_rgba(157,18,72,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:gap-4 sm:px-5`}
    >
      <Sheen />
      <span className="relative z-[1] hidden h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-rose to-rose-deep text-white shadow-[0_8px_18px_-8px_rgba(157,18,72,0.6)] sm:flex">
        <TrophyIcon />
      </span>

      <span className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <StatusPill ongoing={item.ongoing} label={item.statusLabel} />
          <span className="truncate font-serif text-[15px] font-bold leading-none tracking-[-0.2px] text-ink sm:text-[17px]">
            {item.name}
          </span>
        </span>
        <span className="truncate text-[12px] text-[#7a6a5e] sm:text-[12.5px]">{item.meta}</span>
      </span>

      {/* The whole band is the link, so on phones the CTA collapses to a tappable arrow chip to
          give the title room; it expands to the labelled pill from sm up. */}
      <span className="relative z-[1] inline-flex h-9 w-9 flex-none items-center justify-center gap-1.5 rounded-full bg-rose text-[12.5px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(194,24,91,0.6)] transition-colors group-hover:bg-rose-deep sm:h-auto sm:w-auto sm:px-4 sm:py-2">
        <span className="hidden sm:inline">{ctaLabel}</span>
        <ArrowIcon />
      </span>
    </Link>
  )
}

// ── Several activities: a seamless auto-scrolling ticker of pills ─────────────────────────────────
function TickerStrip({ items, ctaLabel }: { items: PromoItem[]; ctaLabel: string }) {
  // Constant, unhurried speed: ~10s per item, floored so a 2-item strip still drifts gently.
  const durationStyle = { '--promo-dur': `${Math.max(items.length * 10, 22)}s` } as CSSProperties
  // Fade both edges so pills melt in/out rather than pop at the border.
  const fade = 'linear-gradient(to right, transparent, #000 5%, #000 95%, transparent)'

  return (
    <div className={`${SHELL} px-0`}>
      <div
        className="relative h-full w-full overflow-hidden"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <ul className="promo-ticker-track absolute inset-y-0 left-0 flex h-full w-max list-none items-center gap-3 pl-4" style={durationStyle}>
          {items.map((item, i) => (
            <li key={`a-${i}`}>
              <TickerPill item={item} ctaLabel={ctaLabel} />
            </li>
          ))}
          {/* Duplicate copy purely for the seamless loop — hidden from assistive tech + non-interactive. */}
          {items.map((item, i) => (
            <li key={`b-${i}`} aria-hidden="true">
              <TickerPill item={item} ctaLabel={ctaLabel} clone />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TickerPill({ item, ctaLabel, clone = false }: { item: PromoItem; ctaLabel: string; clone?: boolean }) {
  const inner = (
    <>
      <StatusPill ongoing={item.ongoing} label={item.statusLabel} />
      <span className="font-serif text-[14px] font-bold tracking-[-0.2px] text-ink">{item.name}</span>
      <span className="text-[12.5px] text-[#7a6a5e]">{item.meta}</span>
      <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-rose px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors group-hover/pill:bg-rose-deep">
        {ctaLabel}
        <ArrowIcon />
      </span>
    </>
  )
  const shared =
    'inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-rose/12 bg-white/70 py-1.5 pl-2.5 pr-1.5 shadow-[0_2px_10px_-4px_rgba(157,18,72,0.18)]'
  if (clone) {
    return <span className={`${shared} pointer-events-none`}>{inner}</span>
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

function StatusPill({ ongoing, label }: { ongoing: boolean; label: string }) {
  return (
    <span
      className={
        ongoing
          ? 'inline-flex flex-none items-center gap-1.5 rounded-full border border-teal/30 bg-teal-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-teal'
          : 'inline-flex flex-none items-center gap-1.5 rounded-full border border-rose/25 bg-rose-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-rose'
      }
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

// Diagonal light sweep for the single-activity card. Decorative + inert; parked off-screen at rest.
function Sheen() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl">
      <span className="promo-sheen absolute inset-y-0 -left-1/4 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]" />
    </span>
  )
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
