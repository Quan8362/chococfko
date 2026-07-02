import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import ReportProblemButton from '../_components/ReportProblemButton'

export const metadata = { title: 'Poker · Known issues' }
export const dynamic = 'force-dynamic'

// Player-facing Known-Issues page for the Closed Beta. Reachable from the beta banner.
// The layout already gates visibility (beta members / admins only). Content is i18n so it
// shows in the tester's language; the empty state is honest ("none logged yet") — we do
// NOT fabricate a list of issues.
export default async function PokerKnownIssues() {
  const t = await getTranslations('games.poker.beta')
  return (
    <div className="poker-root mx-auto max-w-2xl px-5 py-10 pb-20 sm:px-6">
      <Link href="/games/poker" className="text-[13px] text-rose hover:underline">← {t('ki_back')}</Link>
      <h1 className="mt-2 font-serif text-2xl font-bold text-ink">{t('ki_title')}</h1>
      <p className="mt-2 text-[14px] text-muted">{t('ki_intro')}</p>

      <div className="mt-6 rounded-xl border border-dashed border-line bg-paper px-4 py-8 text-center text-[13px] text-muted">
        {t('ki_none')}
      </div>

      <div className="mt-6">
        <ReportProblemButton variant="inline" context={{ path: '/games/poker/known-issues' }} />
      </div>
    </div>
  )
}
