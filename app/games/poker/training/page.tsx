import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import TrainingClient from './TrainingClient'

// Dynamic like every gated poker route (the layout gates on getPokerAccess()). The training table
// is NOT a real cash table: it never appears in the public lobby, writes nothing to the database,
// and moves no wallet coins — all logic runs in the pure client-side trainer.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('learn.training.title')} · ${t('title')}` }
}

export default function PokerTrainingPage() {
  return (
    <PokerShell>
      <TrainingClient />
    </PokerShell>
  )
}
