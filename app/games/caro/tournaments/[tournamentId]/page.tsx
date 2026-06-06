import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getTournamentById, getMyParticipation } from '../actions'
import TournamentDetail from './TournamentDetail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { tournamentId: string } }) {
  const t = await getTranslations('games.caro')
  const { tournament } = await getTournamentById(params.tournamentId)
  if (!tournament) return { title: `${t('tournament_page_title')} · Chợ Cóc FKO` }
  return { title: `${tournament.title} · ${t('tournament_page_title')} · Chợ Cóc FKO` }
}

export default async function TournamentPage({ params }: { params: { tournamentId: string } }) {
  const [t, supabase, isAdmin, data] = await Promise.all([
    getTranslations('games.caro'),
    Promise.resolve(createClient()),
    checkIsAdmin(),
    getTournamentById(params.tournamentId),
  ])

  if (!data.tournament) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const myParticipation = user ? await getMyParticipation(params.tournamentId) : null

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7">
        <Link href="/games/caro" className="hover:text-rose transition-colors">{t('title')}</Link>
        <span>/</span>
        <Link href="/games/caro/tournaments" className="hover:text-rose transition-colors">{t('tournament_link')}</Link>
        <span>/</span>
        <span className="text-ink/70 truncate max-w-[200px]">{data.tournament.title}</span>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="font-serif font-bold text-[clamp(22px,3.5vw,34px)] leading-tight tracking-[-0.4px] text-ink mb-1">
          {data.tournament.title}
        </h1>
      </div>

      <TournamentDetail
        tournament={data.tournament}
        participants={data.participants}
        matches={data.matches}
        groups={data.groups}
        groupMembers={data.groupMembers}
        nameMap={data.nameMap}
        userId={user?.id ?? null}
        myParticipation={myParticipation}
        isAdmin={isAdmin}
      />
    </div>
  )
}
