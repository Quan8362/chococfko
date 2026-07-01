import { getTranslations } from 'next-intl/server'
import PokerShell from '../_eco/PokerShell'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('settings.title')} · ${t('title')}` }
}

export default async function PokerSettingsPage() {
  return (
    <PokerShell>
      <SettingsClient />
    </PokerShell>
  )
}
