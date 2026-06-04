import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type CaroRoom } from '../actions'
import CaroGame from './CaroGame'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { roomCode: string } }) {
  return { title: `Phòng ${params.roomCode.toUpperCase()} · Cờ Caro · Chợ Cóc FKO` }
}

async function getPlayerName(admin: ReturnType<typeof createAdminClient>, userId: string | null): Promise<string> {
  if (!userId) return '—'
  const { data } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  if (data?.display_name) return data.display_name
  // Fallback to auth metadata
  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Người chơi'
  )
}

export default async function CaroRoomPage({ params }: { params: { roomCode: string } }) {
  const code = params.roomCode.toUpperCase()
  const admin = createAdminClient()
  const supabase = createClient()

  const [{ data: { user } }, { data: room }] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('caro_rooms').select('*').eq('room_code', code).maybeSingle(),
  ])

  if (!room) notFound()

  // Auto-join as player O if eligible
  let finalRoom = room as CaroRoom
  if (user && room.status === 'waiting' && !room.player_o && room.player_x !== user.id) {
    await admin.from('caro_rooms').update({
      player_o: user.id,
      status: 'playing',
    }).eq('id', room.id)
    finalRoom = { ...finalRoom, player_o: user.id, status: 'playing' } as CaroRoom
  }

  // Fetch player display names in parallel
  const [playerXName, playerOName] = await Promise.all([
    getPlayerName(admin, finalRoom.player_x),
    finalRoom.player_o ? getPlayerName(admin, finalRoom.player_o) : Promise.resolve(null),
  ])

  return (
    <div className="max-w-[700px] mx-auto px-4 py-8">
      <CaroGame
        initialRoom={finalRoom}
        userId={user?.id ?? null}
        playerXName={playerXName}
        playerOName={playerOName}
      />
    </div>
  )
}
