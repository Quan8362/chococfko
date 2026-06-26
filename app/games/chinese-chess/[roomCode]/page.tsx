import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ChessRoom, type MoveEntry } from '../actions'
import ChineseChessGame from './ChineseChessGame'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { roomCode: string } }) {
  const t = await getTranslations('games.chinese_chess')
  return { title: `${t('room_label')} ${params.roomCode.toUpperCase()} · ${t('title')}` }
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

export default async function ChineseChessRoomPage({ params }: { params: { roomCode: string } }) {
  const code  = params.roomCode.toUpperCase()
  const admin = createAdminClient()
  const supabase = createClient()

  const [{ data: { user } }, { data: room }, tCommon] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('chinese_chess_rooms').select('*').eq('room_code', code).maybeSingle(),
    getTranslations('common'),
  ])

  if (!room) notFound()

  const playerFallback = tCommon('player_fallback')

  // Auto-join as Black if the seat is still open
  let finalRoom = room as ChessRoom
  if (user && room.status === 'waiting' && !room.player_black && room.player_red !== user.id) {
    await admin.from('chinese_chess_rooms').update({
      player_black: user.id,
      status: 'playing',
    }).eq('id', room.id)
    finalRoom = { ...finalRoom, player_black: user.id, status: 'playing' } as ChessRoom
  }

  const [playerRedName, playerBlackName, { data: movesData }] = await Promise.all([
    getPlayerName(admin, finalRoom.player_red, playerFallback),
    finalRoom.player_black ? getPlayerName(admin, finalRoom.player_black, playerFallback) : Promise.resolve(null),
    admin
      .from('chinese_chess_moves')
      .select('id,side,from_row,from_col,to_row,to_col,piece,captured_piece,move_number')
      .eq('room_id', finalRoom.id)
      .order('move_number', { ascending: true }),
  ])

  const initialMoves = (movesData ?? []) as MoveEntry[]

  const myRole =
    user?.id === finalRoom.player_red   ? 'red'   :
    user?.id === finalRoom.player_black ? 'black' :
    'spectator'

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 pb-16">
      <ChineseChessGame
        initialRoom={finalRoom}
        userId={user?.id ?? null}
        myRole={myRole}
        playerRedName={playerRedName}
        playerBlackName={playerBlackName}
        initialMoves={initialMoves}
      />
    </div>
  )
}
