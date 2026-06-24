'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import FlashcardViewer from '@/components/japanese/FlashcardViewer'
import LevelPicker, { JLPT_LEVELS, urlLevel } from '@/components/japanese/LevelPicker'
import { saveWordProgress, type ProgressAction, type ProgressMap } from '@/app/japanese/actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'

/** Aggregated learning progress for a single flashcard deck (set). */
export interface DeckStat {
  deck: number
  from: number
  to: number
  size: number
  mastered: number
}

interface FlashcardClientProps {
  words: JapaneseWord[]
  initialProgress: ProgressMap
  isLoggedIn: boolean
  selectedLevel: string | null
  levelCounts: Record<string, number>
  deckSize: number
  totalDecks: number
  selectedDeck: number | null
  deckStats: DeckStat[]
}

const ArrowRight = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CheckMark = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
)

export default function FlashcardClient({
  words,
  isLoggedIn,
  selectedLevel,
  levelCounts,
  deckSize,
  totalDecks,
  selectedDeck,
  deckStats,
}: FlashcardClientProps) {
  const t = useTranslations('japanese')

  const handleSave = async (wordId: string, action: ProgressAction) => {
    await saveWordProgress(wordId, action)
  }

  /* ── Level picker (no level selected) ── */
  if (!selectedLevel) {
    const levels = JLPT_LEVELS.map(level => ({
      level,
      desc: t(`${level.toLowerCase()}_desc` as Parameters<typeof t>[0]),
      count: levelCounts[level] ?? 0,
      href: `/japanese/flashcards?level=${urlLevel(level)}`,
      label: t('study_flashcard'),
    }))

    return (
      <div>
        <p className="text-[14px] text-muted mb-8">{t('flashcard_select_level')}</p>
        <LevelPicker levels={levels} />
      </div>
    )
  }

  const levelUpper = selectedLevel.toUpperCase()
  const levelTotal = levelCounts[levelUpper] ?? 0

  /* ── Deck picker (level selected, no deck) ── */
  if (!selectedDeck) {
    const stats: DeckStat[] =
      deckStats.length === totalDecks
        ? deckStats
        : Array.from({ length: totalDecks }, (_, i) => {
            const deck = i + 1
            const from = i * deckSize + 1
            const to = Math.min(deck * deckSize, levelTotal)
            return { deck, from, to, size: to - from + 1, mastered: 0 }
          })

    const levelMastered = stats.reduce((s, d) => s + d.mastered, 0)
    const setsCompleted = stats.filter(d => d.size > 0 && d.mastered >= d.size).length
    const levelPct = levelTotal > 0 ? Math.round((levelMastered / levelTotal) * 100) : 0
    const hasProgress = levelMastered > 0
    const levelDone = stats.length > 0 && setsCompleted === stats.length
    const resume = stats.find(d => d.mastered < d.size) ?? stats[0]
    const focusRing =
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

    return (
      <div>
        {/* Level switcher — chips, current level highlighted */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[12.5px] text-muted mr-1">{t('flashcard_change_level')}</span>
          {JLPT_LEVELS.map(lv => {
            const active = lv === levelUpper
            return (
              <Link
                key={lv}
                href={`/japanese/flashcards?level=${urlLevel(lv)}`}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? `px-3 py-1.5 rounded-full text-[12.5px] font-bold bg-rose text-white border border-rose ${focusRing}`
                    : `px-3 py-1.5 rounded-full text-[12.5px] font-semibold bg-paper text-muted border border-line hover:border-rose/40 hover:text-rose transition-colors ${focusRing}`
                }
              >
                {lv}
              </Link>
            )
          })}
        </div>

        {/* Level progress overview */}
        <div className="bg-paper border border-line rounded-2xl p-5 mb-4">
          <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="font-serif font-bold text-[28px] leading-none text-ink">{levelPct}%</span>
              <span className="text-[12.5px] text-muted">{t('flashcard_overview_progress')}</span>
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 text-[12.5px] text-muted flex-wrap">
              <span>{t('flashcard_words_mastered', { count: levelMastered, total: levelTotal })}</span>
              <span>{t('flashcard_overview_sets_done', { done: setsCompleted, total: stats.length })}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-rose/10 overflow-hidden">
            <div
              className="h-full bg-rose rounded-full transition-[width] duration-500"
              style={{ width: `${levelPct}%` }}
            />
          </div>
        </div>

        {/* Continue / start entry point (or level-complete banner) */}
        {levelDone ? (
          <div className="flex items-center gap-4 bg-rose/5 border border-rose/25 rounded-2xl p-4 sm:p-5 mb-7">
            <span className="flex-none w-11 h-11 rounded-full bg-rose text-white flex items-center justify-center">
              <CheckMark className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-rose mb-0.5">{levelUpper}</p>
              <p className="text-[15px] font-bold text-ink">{t('flashcard_level_complete')}</p>
            </div>
          </div>
        ) : resume ? (
          <Link
            href={`/japanese/flashcards?level=${selectedLevel}&set=${resume.deck}`}
            className={`group flex items-center gap-4 bg-rose/5 border border-rose/20 rounded-2xl p-4 sm:p-5 mb-7 hover:bg-rose/10 hover:border-rose/40 transition-colors ${focusRing}`}
          >
            <span className="flex-none w-11 h-11 rounded-full bg-rose text-white flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-rose mb-0.5">
                {hasProgress ? t('flashcard_continue_title') : t('flashcard_start_title')}
              </p>
              <p className="text-[15px] font-bold text-ink truncate">
                {t('flashcard_set_n', { n: resume.deck })} · {t('flashcard_set_range', { from: resume.from, to: resume.to })}
              </p>
            </div>
            <span className="flex-none inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
              <span className="hidden sm:inline">
                {hasProgress ? t('flashcard_continue_cta') : t('flashcard_start_cta')}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        ) : null}

        <p className="text-[14px] text-muted mb-4">{t('flashcard_select_set')}</p>

        {/* Set cards — 4 → 3 → 2 → 1 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {stats.map(d => {
            const done = d.size > 0 && d.mastered >= d.size
            const started = d.mastered > 0 && !done
            const pct = d.size > 0 ? Math.round((d.mastered / d.size) * 100) : 0
            return (
              <Link
                key={d.deck}
                href={`/japanese/flashcards?level=${selectedLevel}&set=${d.deck}`}
                className={[
                  'group relative flex flex-col rounded-2xl border p-4 cursor-pointer',
                  'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_22px_-8px_rgba(194,24,91,0.28)]',
                  focusRing,
                  done
                    ? 'bg-rose/5 border-rose/30'
                    : 'bg-paper border-line hover:border-rose/40 hover:bg-rose/[0.03]',
                ].join(' ')}
              >
                <div className="flex items-start gap-3 mb-3.5">
                  <span
                    className={[
                      'flex-none w-9 h-9 rounded-xl flex items-center justify-center text-[14px] font-bold tabular-nums transition-colors',
                      done
                        ? 'bg-rose text-white'
                        : started
                          ? 'bg-rose/15 text-rose'
                          : 'bg-line/50 text-muted group-hover:bg-rose/15 group-hover:text-rose',
                    ].join(' ')}
                  >
                    {done ? <CheckMark className="w-5 h-5" /> : d.deck}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink leading-tight group-hover:text-rose transition-colors">
                      {t('flashcard_set_n', { n: d.deck })}
                    </p>
                    <p className="text-[12px] text-muted mt-0.5">
                      {t('flashcard_set_range', { from: d.from, to: d.to })}
                    </p>
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`text-[11.5px] font-medium ${done ? 'text-rose' : started ? 'text-ink' : 'text-muted'}`}
                    >
                      {done
                        ? t('flashcard_completed_label')
                        : t('flashcard_words_mastered', { count: d.mastered, total: d.size })}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-rose opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
                      {t('flashcard_study_cue')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-rose/10 overflow-hidden">
                    <div
                      className="h-full bg-rose rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── Active flashcard session ── */
  return (
    <div>
      {/* Back link */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href={`/japanese/flashcards?level=${selectedLevel}`}
          className="text-[12.5px] text-muted hover:text-rose transition-colors"
        >
          ← {t('flashcard_change_set')}
        </Link>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose/10 text-rose border border-rose/20">
          {levelUpper}
        </span>
        <span className="text-[12.5px] text-muted">
          {t('flashcard_set_of', { n: selectedDeck, total: totalDecks })}
        </span>
        <span className="text-[12.5px] text-muted">{t('words_count', { count: words.length })}</span>
      </div>

      <FlashcardViewer
        words={words}
        isLoggedIn={isLoggedIn}
        onSave={handleSave}
        loginMessage={t('login_to_save')}
      />
    </div>
  )
}
