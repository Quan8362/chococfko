import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import GlossaryClient, { type GlossaryTerm, type GlossaryCategory } from './GlossaryClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('glossary.title')} · ${t('title')}` }
}

// Each term keyed to its category so the library can group and filter (no schema change — the
// categorisation is a presentation concern over the same static term set).
const TERMS: { key: string; category: GlossaryCategory }[] = [
  { key: 'check', category: 'actions' },
  { key: 'call', category: 'actions' },
  { key: 'raise', category: 'actions' },
  { key: 'fold', category: 'actions' },
  { key: 'allin', category: 'actions' },
  { key: 'muck', category: 'actions' },
  { key: 'blind', category: 'betting' },
  { key: 'sb', category: 'betting' },
  { key: 'bb', category: 'betting' },
  { key: 'pot', category: 'betting' },
  { key: 'sidepot', category: 'betting' },
  { key: 'buyin', category: 'betting' },
  { key: 'stack', category: 'betting' },
  { key: 'board', category: 'cards' },
  { key: 'flop', category: 'cards' },
  { key: 'turn', category: 'cards' },
  { key: 'river', category: 'cards' },
  { key: 'showdown', category: 'cards' },
  { key: 'kicker', category: 'cards' },
  { key: 'button', category: 'position' },
  { key: 'position', category: 'position' },
]

export default async function PokerGlossaryPage() {
  const t = await getTranslations('games.poker')
  const terms: GlossaryTerm[] = TERMS.map(({ key, category }) => ({
    key,
    category,
    label: t(`glossary.label.${key}`),
    def: t(`glossary.terms.${key}`),
  }))
  return (
    <PokerShell>
      <GlossaryClient terms={terms} />
    </PokerShell>
  )
}
