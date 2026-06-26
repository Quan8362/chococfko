import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { seatIntoRoom } from '../actions'
import TlmnRoom from './TlmnRoom'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { roomCode: string } }) {
  const t = await getTranslations('games.tlmn')
  return { title: `${t('room_code_label')} ${params.roomCode.toUpperCase()} · ${t('title')}` }
}

export default async function TlmnRoomPage({ params }: { params: { roomCode: string } }) {
  const code = params.roomCode.toUpperCase()

  // Auto-seat the visitor into the next free seat (no-op if already seated, room
  // full, or game already in progress → spectator) and return authoritative state.
  const [{ state }, supabase] = await Promise.all([
    seatIntoRoom(code),
    Promise.resolve(createClient()),
  ])
  if (!state) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <TlmnRoom initialState={state} userId={user?.id ?? null} />
    </div>
  )
}
