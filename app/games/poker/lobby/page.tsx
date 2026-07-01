import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import PokerShell from '../_eco/PokerShell'
import LobbyClient from './LobbyClient'
import { listLobby } from '../actions'
import { getPokerAccess, pokerAccessCan } from '../access'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('lobby.title')} · ${t('title')}` }
}

export default async function PokerLobbyPage() {
  // The public table list is behind the public-lobby capability (admins bypass).
  const pokerAccess = await getPokerAccess()
  if (!pokerAccessCan(pokerAccess, 'public_lobby')) notFound()
  const res = await listLobby()
  return (
    <PokerShell>
      <LobbyClient initialTables={res.ok ? res.tables : null} />
    </PokerShell>
  )
}
