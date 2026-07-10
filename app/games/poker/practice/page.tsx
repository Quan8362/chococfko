import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPokerAccess, viewerOf } from '../access'
import { pokerPracticeBotsOn } from '@/lib/games/poker/flags'
import PracticeClient from './PracticeClient'

export const dynamic = 'force-dynamic'

// Practice-bot route. Gated by POKER_PRACTICE_BOTS_ENABLED (default OFF) on TOP of the poker
// layout's visibility gate. While the flag is off (production, this phase) the route 404s — it
// does not advertise its own existence. Nothing here is reachable until the flag is flipped.
export default async function PracticePage() {
  const access = await getPokerAccess()
  const on = pokerPracticeBotsOn(access.flags, viewerOf(access))
  if (!on) notFound()

  const t = await getTranslations('games.poker.practice')
  return (
    <main className="poker-root mx-auto max-w-3xl px-5 py-10 pb-20 sm:px-6">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-400/60 bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
            {t('badge_practice')}
          </span>
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-muted">
            {t('badge_no_reward')}
          </span>
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-muted">
            {t('against_bots')}
          </span>
        </div>
      </header>
      <PracticeClient />
    </main>
  )
}
