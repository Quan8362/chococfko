import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../../_eco/PokerShell'
import { getPokerAccess, pokerAccessTournamentVisible } from '../../../access'
import { getTournamentDetail } from '../../../tournament-actions'
import { participantDisplayState, hasTableAssignment, type EntryLike } from '@/lib/games/poker/tournament/uiModel'
import type { TournamentState } from '@/lib/games/poker/tournament'

export const dynamic = 'force-dynamic'

type Entry = EntryLike & { id: string; user_id: string }

// Assigned-table SHELL (E3A-3B). Live hand play + Realtime are E3A-3C. Participant ownership is
// enforced server-side: we read the viewer's OWN entry (getTournamentDetail is user-scoped) and only
// route on their own assignment — a non-participant or cross-user viewer never reaches a table.
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
  const state = (res.tournament as { state: TournamentState }).state
  const pState = participantDisplayState(state, myEntry)

  return (
    <PokerShell>
      <div className="mb-4">
        <Link href={`/games/poker/tournaments/${params.tournamentId}`} className="text-sm text-rose hover:underline">← {t('back')}</Link>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-8 text-center">
        {hasTableAssignment(myEntry) ? (
          <>
            <p className="mb-1 text-sm font-medium text-ink">{t('field.your_seat')}</p>
            <p className="mb-4 text-2xl font-semibold text-ink">{t('field.table_seat', { table: myEntry.table_no ?? 0, seat: myEntry.seat_index ?? 0 })}</p>
            <p className="text-sm text-ink/60">{t('participant.table_shell')}</p>
          </>
        ) : pState === 'eliminated' ? (
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
