import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import Match3Game from './Match3Game'

export async function generateMetadata() {
  const t = await getTranslations('games.match3')
  return { title: `${t('title')}` }
}

export default async function Match3Page() {
  const t = await getTranslations('games.match3')

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10 pb-20">

      {/* ── Breadcrumb ── */}
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-8"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Mini Game
      </Link>

      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight text-ink mb-2">
          {t('title')}
        </h1>
        <p className="text-[14px] text-muted leading-relaxed max-w-[440px] mx-auto">
          {t('subtitle')}
        </p>
      </div>

      {/* ── Game ── */}
      <Match3Game />
    </div>
  )
}
