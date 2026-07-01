import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import CreateClient from './CreateClient'
import { getPokerAccess, pokerAccessCan } from '../access'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('create.title')} · ${t('title')}` }
}

export default async function PokerCreatePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/games/poker/create')
  // Hosting a table is behind the create capability (admins bypass during rollout).
  const pokerAccess = await getPokerAccess()
  if (!pokerAccessCan(pokerAccess, 'create')) notFound()
  return (
    <PokerShell>
      <CreateClient />
    </PokerShell>
  )
}
