import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import GlossaryClient, { type GlossaryTerm } from './GlossaryClient'

// Must render per-request: the poker layout gates on getPokerAccess() (POKER_ENABLED / admin
// cookie). A force-static prerender bakes the build-time gate result (feature OFF ⇒ notFound),
// which would 404 this page for admins and after a flag-flip until a rebuild. Dynamic like every
// other gated poker route.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('glossary.title')} · ${t('title')}` }
}

const KEYS = [
  'blind', 'sb', 'bb', 'button', 'position', 'check', 'call', 'raise', 'fold', 'allin',
  'pot', 'sidepot', 'board', 'flop', 'turn', 'river', 'showdown', 'muck', 'buyin', 'stack', 'kicker',
] as const

export default async function PokerGlossaryPage() {
  const t = await getTranslations('games.poker')
  const terms: GlossaryTerm[] = KEYS.map((k) => ({
    key: k,
    label: t(`glossary.label.${k}`),
    def: t(`glossary.terms.${k}`),
  }))
  return (
    <PokerShell>
      <GlossaryClient terms={terms} />
    </PokerShell>
  )
}
