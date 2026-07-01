import { getTranslations } from 'next-intl/server'
import PokerPreview from './PokerPreview'

// Isolated component-preview route for the Poker visual design system. This is NOT the gameplay
// page — it renders every reusable component and seat state in isolation so the design system can
// be reviewed and tested on its own (visual-spec UI release gates).
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: t('preview.title') }
}

export default function PokerPreviewPage() {
  return <PokerPreview />
}
