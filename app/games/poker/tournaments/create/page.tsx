import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../_eco/PokerShell'
import { getPokerAccess, pokerAccessTournamentOperator } from '../../access'
import CreateTournamentForm from '../../_components/CreateTournamentForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker.tournaments')
  return { title: t('operator.create_title') }
}

export default async function CreateTournamentPage() {
  const acc = await getPokerAccess()
  // Operator-only: a non-operator (participant or public) gets the section's safe-denial 404 —
  // the create flow is never rendered to, nor reachable by, a normal participant.
  if (!pokerAccessTournamentOperator(acc)) notFound()
  const t = await getTranslations('games.poker.tournaments')

  return (
    <PokerShell>
      <div className="mb-4">
        <Link href="/games/poker/tournaments" className="text-sm text-rose hover:underline">← {t('back')}</Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-ink">{t('operator.create_title')}</h1>
      <p className="mb-5 text-xs text-ink/50">{t('coin_note')}</p>
      <CreateTournamentForm />
    </PokerShell>
  )
}
