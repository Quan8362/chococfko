import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../_eco/PokerShell'
import { getPokerAccess, pokerAccessTournamentOperator } from '../../access'
import CreateTournamentForm from '../../_components/CreateTournamentForm'
import { Icon } from '../../_eco/icons'
import { PageHeader, Eyebrow } from '../../_eco/ui'

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
      <Link
        href="/games/poker/tournaments"
        className="mb-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 -ml-2 text-sm text-[color:var(--pkp-ink-2)] transition-colors hover:text-[color:var(--pkp-ink)]"
      >
        <Icon name="chevronLeft" size={16} /> {t('back')}
      </Link>
      <PageHeader
        eyebrow={<Eyebrow icon="trophy">{t('nav')}</Eyebrow>}
        icon="plus"
        tone="amber"
        title={t('operator.create_title')}
        subtitle={t('coin_note')}
      />
      <CreateTournamentForm />
    </PokerShell>
  )
}
