import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerTable, { type PokerTableConfig } from './PokerTable'
import { getBetaTermsAck } from '../access'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { tableId: string } }) {
  const t = await getTranslations('games.poker')
  const supabase = createClient()
  const { data } = await supabase.from('poker_tables').select('name').eq('id', params.tableId).maybeSingle()
  const name = data?.name ?? t('title')
  return { title: `${name} · ${t('title')}` }
}

export default async function PokerTablePage({ params }: { params: { tableId: string } }) {
  const supabase = createClient()
  const [{ data: { user } }, { data: table }] = await Promise.all([
    supabase.auth.getUser(),
    // RLS-safe public columns; the gameplay client reads live state via the realtime snapshot.
    supabase
      .from('poker_tables')
      .select('id, name, status, small_blind, big_blind, capacity, min_buy_in_bb, max_buy_in_bb, allow_spectators, action_time_seconds, time_bank_seconds')
      .eq('id', params.tableId)
      .maybeSingle(),
  ])

  if (!table || table.status === 'closed') notFound()

  // A cohort member who has not accepted the current Beta terms is sent to the terms gate
  // before any table (incl. a shared direct link), so the join/sit path is never reached
  // pre-acceptance. Server actions (sit/join) enforce this too; this is the reachable UX.
  const ack = await getBetaTermsAck()
  if (ack.required && !ack.acknowledged) redirect('/games/poker')

  // Buy-in bounds are derived from the AUTHORITATIVE table config (the same formula the
  // poker_sit_down RPC re-validates server-side: bb × buy-in-in-bb). The client only displays
  // these — the server re-checks the wallet, the bounds and the entry gate on sit-down.
  const config: PokerTableConfig = {
    name: table.name,
    smallBlind: table.small_blind,
    bigBlind: table.big_blind,
    capacity: table.capacity,
    minBuyIn: table.big_blind * table.min_buy_in_bb,
    maxBuyIn: table.big_blind * table.max_buy_in_bb,
    actionTimeSeconds: table.action_time_seconds ?? 20,
    timeBankSeconds: table.time_bank_seconds ?? 15,
    allowSpectators: !!table.allow_spectators,
  }

  return <PokerTable tableId={table.id} userId={user?.id ?? null} config={config} />
}
