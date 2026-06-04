import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export const metadata = { title: 'Mini Game · Chợ Cóc FKO' }

export default async function GamesPage() {
  const t = await getTranslations('games')

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('page_badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(28px,4vw,42px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('page_heading')}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed max-w-[520px]">
          {t('page_desc')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Destination Wheel */}
        <Link
          href="/games/destination-wheel"
          className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_24px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose/15 to-gold/10 flex items-center justify-center text-[24px]">
              🎡
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal text-white">
              {t('destination_wheel.tag')}
            </span>
          </div>
          <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5 group-hover:text-rose transition-colors">
            {t('destination_wheel.title')}
          </h2>
          <p className="text-[13px] text-muted leading-relaxed mb-3">{t('destination_wheel.short_desc')}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-muted/70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {t('destination_wheel.solo')}
          </div>
        </Link>

        {/* Caro */}
        <Link
          href="/games/caro"
          className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_24px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose/15 to-teal/10 flex items-center justify-center text-[24px]">
              ⚫
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose text-white">
              {t('caro.tag')}
            </span>
          </div>
          <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5 group-hover:text-rose transition-colors">
            {t('caro.title')}
          </h2>
          <p className="text-[13px] text-muted leading-relaxed mb-3">{t('caro.short_desc')}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-muted/70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('players_label', { n: 2 })}
          </div>
        </Link>

        {/* Chinese Chess */}
        <Link
          href="/games/chinese-chess"
          className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_24px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-100 to-amber-50 flex items-center justify-center text-[24px]">
              ♟️
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose text-white">
              {t('chinese_chess.tag')}
            </span>
          </div>
          <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5 group-hover:text-rose transition-colors">
            {t('chinese_chess.title')}
          </h2>
          <p className="text-[13px] text-muted leading-relaxed mb-3">{t('chinese_chess.short_desc')}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-muted/70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('players_label', { n: 2 })}
          </div>
        </Link>

        {/* Minesweeper */}
        <Link
          href="/games/minesweeper"
          className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_24px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal/10 flex items-center justify-center text-[24px]">
              💣
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
              {t('minesweeper.tag')}
            </span>
          </div>
          <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5 group-hover:text-rose transition-colors">
            {t('minesweeper.title')}
          </h2>
          <p className="text-[13px] text-muted leading-relaxed mb-3">{t('minesweeper.short_desc')}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-muted/70">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {t('destination_wheel.solo')}
          </div>
        </Link>

        <div className="bg-cream/50 border border-dashed border-line rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
          <span className="text-[28px]">🎲</span>
          <p className="text-[13px] text-muted/60 font-medium">{t('coming_soon')}</p>
        </div>
      </div>
    </div>
  )
}
