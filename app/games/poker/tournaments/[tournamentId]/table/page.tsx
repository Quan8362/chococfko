import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../../_eco/PokerShell'
import { getPokerAccess, pokerAccessTournamentVisible } from '../../../access'
import { getTournamentDetail } from '../../../tournament-actions'
import { participantDisplayState, hasTableAssignment, type EntryLike } from '@/lib/games/poker/tournament/uiModel'
import type { TournamentState } from '@/lib/games/poker/tournament'
import TournamentTable from './TournamentTable'

export const dynamic = 'force-dynamic'

type Entry = EntryLike & { id: string; user_id: string }

// Assigned-table route (E3A-3C live). Participant ownership is enforced server-side: we read the
// viewer's OWN entry (getTournamentDetail is user-scoped) and only route on their own assignment —
// a non-participant or cross-user viewer never reaches a table. When the viewer holds a live seat we
// mount the realtime TournamentTable; otherwise we render their non-playing status (waiting /
// eliminated / champion) as a lightweight shell.
export default async function TournamentTablePage({ params }: { params: { tournamentId: string } }) {
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentVisible(acc)) notFound()
  const [t, res] = await Promise.all([
    getTranslations('games.poker.tournaments'),
    getTournamentDetail(params.tournamentId),
  ])
  if (!res.ok) notFound()

  const myEntry = (res.myEntry as Entry | null) ?? null
  // Not a participant in THIS tournament → safe denial (no cross-user / cross-tournament access).
  if (!myEntry || myEntry.state === 'WITHDRAWN') notFound()
  const tr = res.tournament as { state: TournamentState; seats_per_table: number }
  const state = tr.state
  const pState = participantDisplayState(state, myEntry)

  // Live seat → the realtime table surface (its own fixed-inset landscape layout; no PokerShell).
  if (hasTableAssignment(myEntry)) {
    return <TournamentTable tournamentId={params.tournamentId} capacity={Number(tr.seats_per_table) || 6} />
  }

  return (
    <PokerShell>
      <div className="mb-4">
        <Link href={`/games/poker/tournaments/${params.tournamentId}`} className="text-sm text-rose hover:underline">← {t('back')}</Link>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-8 text-center">
        {pState === 'eliminated' ? (
          <p className="text-lg font-medium text-ink">{t('participant.eliminated', { place: myEntry.finishing_place ?? 0 })}</p>
        ) : pState === 'champion' ? (
          <p className="text-lg font-semibold text-ink">{t('participant.champion')}</p>
        ) : (
          <p className="text-sm text-ink/70">{t('participant.not_assigned')}</p>
        )}
      </div>
    </PokerShell>
  )
}
