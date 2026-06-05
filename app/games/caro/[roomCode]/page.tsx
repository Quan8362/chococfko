import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type CaroRoom } from '../actions'
import CaroGame from './CaroGame'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { roomCode: string } }) {
  const t = await getTranslations('games.caro')
  return { title: `${t('room_code_label')} ${params.roomCode.toUpperCase()} · ${t('title')} · Chợ Cóc FKO` }
}

async function getPlayerName(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  fallback: string,
): Promise<string> {
  if (!userId) return '—'
  const { data } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  if (data?.display_name) return data.display_name
  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    fallback
  )
}

export default async function CaroRoomPage({ params }: { params: { roomCode: string } }) {
  const code = params.roomCode.toUpperCase()
  const admin = createAdminClient()
  const supabase = createClient()

  const [{ data: { user } }, { data: room }, tCommon, tCaro] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('caro_rooms').select('*').eq('room_code', code).maybeSingle(),
    getTranslations('common'),
    getTranslations('games.caro'),
  ])

  if (!room) notFound()

  const playerFallback = tCommon('player_fallback')
  const spectatorLabel = tCommon('spectator_label')
  const playerOFallback = tCaro('player_o_label_fallback')

  // Auto-join as player O if eligible
  let finalRoom = room as CaroRoom
  if (user && room.status === 'waiting' && !room.player_o && room.player_x !== user.id) {
    await admin.from('caro_rooms').update({
      player_o: user.id,
      status: 'playing',
    }).eq('id', room.id)
    finalRoom = { ...finalRoom, player_o: user.id, status: 'playing' } as CaroRoom
  }

  const [playerXName, playerOName] = await Promise.all([
    getPlayerName(admin, finalRoom.player_x, playerFallback),
    finalRoom.player_o ? getPlayerName(admin, finalRoom.player_o, playerFallback) : Promise.resolve(null),
  ])

  const myName = user?.id === finalRoom.player_x
    ? playerXName
    : user?.id === finalRoom.player_o
    ? (playerOName ?? playerOFallback)
    : spectatorLabel

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8">
      <CaroGame
        initialRoom={finalRoom}
        userId={user?.id ?? null}
        myName={myName}
        playerXName={playerXName}
        playerOName={playerOName}
      />
    </div>
  )
}
