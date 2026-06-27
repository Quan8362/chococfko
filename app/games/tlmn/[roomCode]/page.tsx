import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getRoomState } from '../actions'
import TlmnRoom from './TlmnRoom'
import TlmnInvitePreview from './TlmnInvitePreview'

export const dynamic = 'force-dynamic'

// Resolve the host (inviter) display name for a room code — used by the unfurl title.
async function hostNameFor(code: string): Promise<string | null> {
  const state = await getRoomState(code)
  if (!state) return null
  const host = state.seats.find(s => s.seat_index === state.room.host_seat)
  return host?.display_name?.trim() || null
}

export async function generateMetadata({ params }: { params: { roomCode: string } }) {
  const code = params.roomCode.toUpperCase()
  const t = await getTranslations('games.tlmn')
  const host = await hostNameFor(code)

  // Rich unfurl: "{host} mời bạn chơi Tiến Lên Miền Nam" (falls back to a generic
  // invite when the host name isn't available). The branded OG image is provided by
  // the colocated opengraph-image route. // TODO(dynamic-og): paint host name into image.
  const title = host
    ? t('og_title_invite', { name: host })
    : t('og_title_generic')
  const description = t('og_description', { code })

  return {
    title: `${t('room_code_label')} ${code} · ${t('title')}`,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image' as const, title, description },
  }
}

export default async function TlmnRoomPage({
  params, searchParams,
}: {
  params: { roomCode: string }
  searchParams?: { spectate?: string }
}) {
  const code = params.roomCode.toUpperCase()

  // Read-only — do NOT seat anyone on a passive page load. Seating happens only on an
  // explicit "Vào phòng" in the invite preview (or the lobby join form / create).
  const [state, supabase] = await Promise.all([
    getRoomState(code),
    Promise.resolve(createClient()),
  ])
  if (!state) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isSeated = !!(user && state.seats.some(s => s.user_id === user.id))
  const spectate = searchParams?.spectate === '1'

  // MODE A (practice) is private to its single human owner — nobody else can view,
  // spectate, or join it. A non-occupant gets a plain 404.
  if (state.room.mode === 'practice' && !isSeated) notFound()

  // Already in the room (host, joined player, or returning reconnect) → the room view.
  // An explicit spectate link lets a non-seated visitor watch an in-progress game.
  if (isSeated || spectate) {
    return (
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 pb-20">
        <TlmnRoom
          initialState={state}
          userId={user?.id ?? null}
          joinError={!isSeated && spectate && state.room.status === 'playing' ? 'in_progress' : null}
        />
      </div>
    )
  }

  // Not seated yet → the friendly invite preview (inviter + player list + rules + CTA).
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <TlmnInvitePreview state={state} userId={user?.id ?? null} code={code} />
    </div>
  )
}
