import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'
import { SITE_URL } from '@/lib/seo'
import Reveal from './Reveal'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('about')
  const description = t('meta_description')
  const canonical = `${SITE_URL}/about`
  // about.title already carries the brand suffix per locale, so bypass the root
  // title.template (`%s · Chợ Cóc FKO`) with `absolute` to avoid doubling it.
  return {
    title: { absolute: t('title') },
    description,
    alternates: { canonical },
    openGraph: { title: t('title'), description, url: canonical },
  }
}

type IconName =
  | 'find'
  | 'know'
  | 'open'
  | 'pin'
  | 'pencil'
  | 'globe'
  | 'compass'
  | 'users'
  | 'spark'

// Single line-icon family (matched stroke weight, currentColor) — used for the
// FKO cards, the stat strip and the FAQ cards so the whole page shares one set.
function LineIcon({ name, className = 'w-6 h-6' }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  }
  switch (name) {
    case 'find': // search
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      )
    case 'know': // open book
      return (
        <svg {...common}>
          <path d="M12 6.5C10.5 5.3 8.6 4.8 6 4.8c-1 0-2 .1-3 .4v13c1-.3 2-.4 3-.4 2.6 0 4.5.5 6 1.7 1.5-1.2 3.4-1.7 6-1.7 1 0 2 .1 3 .4v-13c-1-.3-2-.4-3-.4-2.6 0-4.5.5-6 1.7Z" />
          <path d="M12 6.5V20" />
        </svg>
      )
    case 'open': // community / people
      return (
        <svg {...common}>
          <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
          <circle cx="10" cy="8" r="3.2" />
          <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
          <path d="M15.5 5.1a3.2 3.2 0 0 1 0 6.1" />
        </svg>
      )
    case 'pin': // map pin
      return (
        <svg {...common}>
          <path d="M12 21s-6.5-5.4-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21Z" />
          <circle cx="12" cy="10.6" r="2.4" />
        </svg>
      )
    case 'pencil': // edit / write
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5S14.3 18.2 12 20.5C9.7 18.2 8.5 15.2 8.5 12S9.7 5.8 12 3.5Z" />
        </svg>
      )
    case 'compass': // "what we do" — explore/map
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
        </svg>
      )
    case 'users': // "who can join"
      return (
        <svg {...common}>
          <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
          <circle cx="10" cy="8" r="3.2" />
          <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
          <path d="M15.5 5.1a3.2 3.2 0 0 1 0 6.1" />
        </svg>
      )
    case 'spark': // "why share" — lightbulb / idea
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z" />
        </svg>
      )
  }
}

// Find / Know / Open are brand words — kept identical across all languages.
const FKO_CARDS = [
  { word: 'Find', icon: 'find', descKey: 'fko_find_desc' },
  { word: 'Know', icon: 'know', descKey: 'fko_know_desc' },
  { word: 'Open', icon: 'open', descKey: 'fko_open_desc' },
] as const

const SECTIONS = [
  { key: 's1', icon: 'compass' },
  { key: 's2', icon: 'users' },
  { key: 's3', icon: 'spark' },
] as const

async function getApprovedPostCount(): Promise<number> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 0
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    const { count } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function GioiThieu() {
  const t = await getTranslations('about')

  const [dbPlaces, postCount] = await Promise.all([
    getAllPlacesFromDb(),
    getApprovedPostCount(),
  ])
  const placeCount = (dbPlaces ?? staticPlaces).length

  const stats = [
    { icon: 'pin' as const, label: t('stat_places_label'), value: String(placeCount) },
    { icon: 'pencil' as const, label: t('stat_posts_label'), value: postCount > 0 ? String(postCount) : '∞' },
    { icon: 'globe' as const, label: t('stat_langs_label'), value: t('stat_langs_value') },
  ]

  // Shared card styling — 1px light border, soft shadow, consistent radius, hover lift.
  const cardBase =
    'rounded-2xl bg-paper border border-rose/10 shadow-card transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-card-hover hover:border-rose/25'

  return (
    <div className="px-5 sm:px-6 py-14 sm:py-20">
      <div className="max-w-[1100px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors"
        >
          {t('back')}
        </Link>

        {/* ── HERO ── 2-column on desktop, stacked on mobile */}
        <Reveal className="mt-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: copy + stats */}
            <div>
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-5 before:h-px before:bg-rose/60 after:content-[''] after:w-5 after:h-px after:bg-rose/60">
                {t('label')}
              </span>
              <h1 className="font-serif font-black text-[clamp(32px,5vw,58px)] leading-[1.08] tracking-[-0.5px] text-ink mb-5">
                {t('heading')}{' '}
                <em className="not-italic text-rose">{t('heading_accent')}</em>
              </h1>
              <p className="text-[17px] text-muted leading-[1.78] max-w-[520px]">
                {t('intro')}
              </p>

              {/* Stat strip — compact, big numbers, muted labels */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-9 max-w-[520px]">
                {stats.map(({ icon, label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl bg-paper border border-rose/10 shadow-card px-3.5 py-3.5 sm:px-4"
                  >
                    <span className="inline-grid place-items-center w-8 h-8 rounded-lg bg-rose/10 text-rose-deep mb-2">
                      <LineIcon name={icon} className="w-[18px] h-[18px]" />
                    </span>
                    <b className="block font-serif text-[26px] sm:text-[30px] font-black text-rose-deep leading-none">
                      {value}
                    </b>
                    <span className="block mt-1.5 text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.6px] text-muted">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: floating brand collage */}
            <div className="relative mx-auto w-full max-w-[420px] aspect-square select-none" aria-hidden="true">
              {/* soft gradient stage + rings */}
              <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(120%_120%_at_30%_20%,#fbedf3_0%,#faf4ea_60%)] border border-rose/10 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] aspect-square rounded-full border border-rose/10" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-square rounded-full border border-rose/10" />
              </div>

              {/* center logo card */}
              <div className="absolute inset-0 grid place-items-center">
                <div className="bg-paper rounded-3xl shadow-card-hover border border-rose/10 px-7 py-6 animate-float motion-reduce:animate-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-nav.png"
                    alt=""
                    className="h-12 sm:h-14 w-auto object-contain"
                  />
                </div>
              </div>

              {/* floating FKO pills */}
              <div
                className="absolute top-[10%] left-[2%] flex items-center gap-2 bg-paper border border-rose/10 shadow-card rounded-full pl-2 pr-3.5 py-1.5 animate-float motion-reduce:animate-none"
                style={{ animationDelay: '-0.8s', animationDuration: '7s' }}
              >
                <span className="grid place-items-center w-7 h-7 rounded-full bg-rose/10 text-rose-deep">
                  <LineIcon name="find" className="w-4 h-4" />
                </span>
                <span className="font-serif font-bold text-[14px] text-rose-deep">Find</span>
              </div>

              <div
                className="absolute top-[6%] right-[1%] flex items-center gap-2 bg-paper border border-rose/10 shadow-card rounded-full pl-2 pr-3.5 py-1.5 animate-float motion-reduce:animate-none"
                style={{ animationDelay: '-2.4s', animationDuration: '6.5s' }}
              >
                <span className="grid place-items-center w-7 h-7 rounded-full bg-rose/10 text-rose-deep">
                  <LineIcon name="know" className="w-4 h-4" />
                </span>
                <span className="font-serif font-bold text-[14px] text-rose-deep">Know</span>
              </div>

              <div
                className="absolute bottom-[8%] right-[6%] flex items-center gap-2 bg-paper border border-rose/10 shadow-card rounded-full pl-2 pr-3.5 py-1.5 animate-float motion-reduce:animate-none"
                style={{ animationDelay: '-4s', animationDuration: '7.5s' }}
              >
                <span className="grid place-items-center w-7 h-7 rounded-full bg-rose/10 text-rose-deep">
                  <LineIcon name="open" className="w-4 h-4" />
                </span>
                <span className="font-serif font-bold text-[14px] text-rose-deep">Open</span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── FKO MEANING ── */}
        <Reveal className="mt-24 sm:mt-28 lg:mt-32">
          <div className="mb-9 max-w-[620px]">
            <h2 className="font-serif font-black text-[clamp(24px,3.5vw,34px)] tracking-[-0.4px] text-ink mb-3">
              {t('fko_title')}
            </h2>
            <p className="text-[15px] text-muted leading-[1.7]">
              {t('fko_sub')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {FKO_CARDS.map(({ word, icon, descKey }, i) => (
              <Reveal key={word} delay={i * 90}>
                <div className={`${cardBase} h-full p-6`}>
                  <div className="w-14 h-14 rounded-2xl bg-rose/10 border border-rose/15 grid place-items-center text-rose-deep mb-4">
                    <LineIcon name={icon} className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif font-bold text-[22px] text-rose-deep mb-2.5">{word}</h3>
                  <p className="text-[14px] text-muted leading-[1.7]">
                    {t(descKey as Parameters<typeof t>[0])}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── FAQ SECTIONS ── */}
        <Reveal className="mt-24 sm:mt-28 lg:mt-32">
          <div className="space-y-5">
            {SECTIONS.map(({ key, icon }, i) => (
              <Reveal key={key} delay={i * 90}>
                <div className={`${cardBase} flex gap-5 p-6`}>
                  <div className="flex-none w-12 h-12 rounded-xl bg-rose/10 border border-rose/15 grid place-items-center text-rose-deep">
                    <LineIcon name={icon} className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-serif font-bold text-[18px] text-ink mb-2">
                      {t(`${key}_title` as Parameters<typeof t>[0])}
                    </h2>
                    <p className="text-[14.5px] text-muted leading-[1.72]">
                      {t(`${key}_desc` as Parameters<typeof t>[0])}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── CTA ── */}
        <Reveal className="mt-24 sm:mt-28 lg:mt-32">
          <div className="relative overflow-hidden rounded-3xl py-12 px-7 text-center text-white bg-[linear-gradient(135deg,#9d1248_0%,#c2185b_55%,#d6356f_100%)] shadow-card-hover">
            {/* subtle light bloom */}
            <div className="pointer-events-none absolute -top-1/3 right-[-10%] w-[60%] aspect-square rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <p className="font-serif text-[22px] font-bold mb-2 leading-snug">
                {t('cta_heading')}
              </p>
              <p className="text-white/75 text-[14.5px] mb-7 max-w-[460px] mx-auto">
                {t('cta_sub')}
              </p>
              <Link
                href="/community/write"
                className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-white text-rose-deep shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:bg-[#fffdf8] hover:scale-[1.04] active:scale-100 transition-transform duration-200 ease-out"
              >
                {t('cta')}
              </Link>
            </div>
          </div>
        </Reveal>

      </div>
    </div>
  )
}
