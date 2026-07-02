import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import CreateClient from './CreateClient'
import { getPokerAccess, pokerAccessCan, getBetaTermsAck } from '../access'

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
  // A cohort member who has not accepted the current Beta terms is sent to the terms gate
  // (on the poker landing) rather than a create form that the server would reject.
  const ack = await getBetaTermsAck(pokerAccess)
  if (ack.required && !ack.acknowledged) redirect('/games/poker')
  return (
    <PokerShell>
      <CreateClient />
    </PokerShell>
  )
}
