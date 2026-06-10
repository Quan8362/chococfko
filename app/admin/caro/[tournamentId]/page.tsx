import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getTournamentForAdmin } from '../actions'
import AdminTournamentClient from './AdminTournamentClient'

export const dynamic = 'force-dynamic'

export default async function AdminTournamentDetailPage({ params }: { params: { tournamentId: string } }) {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) redirect('/')

  const t = await getTranslations('games.caro')

  const { tournament, participants, matches, groups, groupMembers } = await getTournamentForAdmin(params.tournamentId)
  if (!tournament) notFound()

  // Build name map
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const allUserIds = new Set<string>()
  ;(participants ?? []).forEach(p => allUserIds.add(p.user_id))
  ;(matches ?? []).forEach(m => {
    if (m.player_x_id) allUserIds.add(m.player_x_id)
    if (m.player_o_id) allUserIds.add(m.player_o_id)
    if (m.winner_user_id) allUserIds.add(m.winner_user_id)
  })

  const nameMap: Record<string, string> = {}
  if (allUserIds.size > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', Array.from(allUserIds))
    profiles?.forEach(p => { if (p.display_name) nameMap[p.id] = p.display_name })
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/caro" className="hover:text-rose transition-colors">{t('title')}</Link>
        <span>/</span>
        <span className="text-ink/70 truncate max-w-[200px]">{tournament.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-serif font-bold text-[26px] text-ink mb-1">{tournament.title}</h1>
          {tournament.description && (
            <p className="text-[13.5px] text-muted">{tournament.description}</p>
          )}
        </div>
        <Link
          href={`/games/caro/tournaments/${tournament.id}`}
          target="_blank"
          className="text-[12.5px] font-medium text-muted hover:text-rose transition-colors flex items-center gap-1"
        >
          Xem công khai →
        </Link>
      </div>

      <AdminTournamentClient
        tournament={tournament}
        participants={participants ?? []}
        matches={matches ?? []}
        groups={groups ?? []}
        groupMembers={groupMembers ?? []}
        nameMap={nameMap}
      />
    </div>
  )
}
