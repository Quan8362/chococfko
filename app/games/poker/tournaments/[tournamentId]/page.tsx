import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import PokerShell from '../../_eco/PokerShell'
import { coins } from '../../_eco/format'
import { getPokerAccess, pokerAccessTournamentVisible } from '../../access'
import { getTournamentDetail } from '../../tournament-actions'
import TournamentActions from '../../_components/TournamentActions'
import TournamentOperatorPanel from '../../_components/TournamentOperatorPanel'
import {
  registrationOpen, canUnregister, participantDisplayState, hasTableAssignment,
  championEntryId, effectiveFinishingPlace, type EntryLike, type PayoutLike,
} from '@/lib/games/poker/tournament/uiModel'
import type { TournamentState } from '@/lib/games/poker/tournament'

export const dynamic = 'force-dynamic'

type Entry = EntryLike & { id: string; user_id: string; chips: number }
type Payout = { entry_id: string; user_id: string; place: number | null; amount: number; kind: string }
type Level = { smallBlind: number; bigBlind: number; ante?: number }

export default async function TournamentDetailPage({ params }: { params: { tournamentId: string } }) {
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentVisible(acc)) notFound()
  const [t, locale, res] = await Promise.all([
    getTranslations('games.poker.tournaments'),
    getLocale(),
    getTournamentDetail(params.tournamentId),
  ])
  if (!res.ok) notFound()

  const tr = res.tournament as Record<string, any>
  const entries = (res.entries as Entry[]) ?? []
  const payouts = (res.payouts as Payout[]) ?? []
  const myEntry = (res.myEntry as Entry | null) ?? null
  const state = tr.state as TournamentState
  const registered = entries.filter((e) => e.state !== 'WITHDRAWN').length
  // Escrow is held whenever any entry has neither been refunded (WITHDRAWN) nor paid (PAID); a plain
  // Cancel of such a tournament would strand fees, so the operator panel offers refund-recovery.
  const escrowHeld = entries.some((e) => e.state !== 'WITHDRAWN' && e.state !== 'PAID')
  const prize = Math.max(Number(tr.guaranteed_prize_pool ?? 0), Number(tr.entry_fee) * registered)
  const levels: Level[] = tr.config?.blindStructure?.levels ?? []
  const startLevel = levels[0]
  const curLevel = levels[Number(tr.current_level_index ?? 0)] ?? startLevel

  // Authoritative winner from the payout rows (the last survivor keeps a NULL finishing_place — the
  // place-1 prize payout is the source of truth for who won). Reused by the banner + standings.
  const championId = championEntryId(payouts as PayoutLike[])
  const pState = participantDisplayState(state, myEntry, !!myEntry && myEntry.id === championId)
  const canReg = registrationOpen(state, registered, Number(tr.max_entries)) && (!myEntry || myEntry.state === 'WITHDRAWN')
  const canUnreg = canUnregister(state, myEntry?.state ?? null)
  const blinds = (lv?: Level) => (lv ? `${coins(lv.smallBlind, locale)} / ${coins(lv.bigBlind, locale)}` : '—')

  const rows: [string, string][] = [
    [t('field.entry_fee'), `${coins(Number(tr.entry_fee), locale)} xu`],
    [t('field.starting_stack'), coins(Number(tr.starting_stack), locale)],
    [t('field.players'), t('field.registered', { count: registered, max: Number(tr.max_entries) })],
    [t('field.seats_per_table'), String(tr.seats_per_table)],
    [t('field.blinds'), blinds(startLevel)],
    [t('field.prize_pool'), `${coins(prize, locale)} xu`],
    ...(Number(tr.guaranteed_prize_pool ?? 0) > 0 ? [[t('field.guarantee'), `${coins(Number(tr.guaranteed_prize_pool), locale)} xu`] as [string, string]] : []),
    ...(state === 'RUNNING' || state === 'BREAK' ? [[t('field.level', { n: Number(tr.current_level_index) + 1 }), blinds(curLevel)] as [string, string]] : []),
  ]

  const standings = [...entries]
    .filter((e) => e.finishing_place != null || e.state === 'PAID' || e.state === 'ELIMINATED')
    .map((e) => ({ e, place: effectiveFinishingPlace(e.id, e.finishing_place, championId) }))
    .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
  const payoutByEntry = new Map(payouts.map((p) => [p.entry_id, p]))

  return (
    <PokerShell>
      <div className="mb-4">
        <Link href="/games/poker/tournaments" className="text-sm text-rose hover:underline">← {t('back')}</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-ink">{tr.title}</h1>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink/70">{t(`state.${state}`)}</span>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700">{t('alpha_badge')}</span>
      </div>

      {/* Participant status + actions */}
      <section className="mb-5 rounded-xl border border-line bg-paper p-4">
        <p className="mb-3 text-sm text-ink/80">
          {pState === 'not_registered' ? t('coin_note')
            : pState === 'registered' ? t('participant.registered')
            : pState === 'waiting' ? t('participant.waiting')
            : pState === 'seated' && myEntry?.table_no != null ? t('participant.seated', { table: myEntry.table_no, seat: myEntry.seat_index ?? 0 })
            : pState === 'eliminated' ? (myEntry?.finishing_place != null ? t('participant.eliminated', { place: myEntry.finishing_place }) : t('participant.eliminated_generic'))
            : pState === 'champion' ? t('participant.champion')
            : t('coin_note')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <TournamentActions tournamentId={params.tournamentId} canRegister={canReg} canUnregister={canUnreg} />
          {hasTableAssignment(myEntry) ? (
            <Link href={`/games/poker/tournaments/${params.tournamentId}/table`}
              className="inline-flex items-center rounded-lg border border-line bg-paper px-4 py-2.5 font-medium text-ink hover:opacity-90">
              {t('participant.go_to_table')}
            </Link>
          ) : (myEntry && (state === 'STARTING') ? <span className="text-sm text-ink/60">{t('participant.not_assigned')}</span> : null)}
        </div>
      </section>

      {res.isOperator && (
        <div className="mb-5">
          <TournamentOperatorPanel tournamentId={params.tournamentId} state={state} currentLevelIndex={Number(tr.current_level_index ?? 0)} escrowHeld={escrowHeld} />
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('field.config')}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-ink/60">{k}</dt><dd className="text-right text-ink">{v}</dd></div>))}
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('participant.list_title')} ({registered})</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {entries.filter((e) => e.state !== 'WITHDRAWN').map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink/80">{e.user_id.slice(0, 8)}…</span>
                <span className="shrink-0 text-ink/60">
                  {(() => {
                    const ep = effectiveFinishingPlace(e.id, e.finishing_place, championId)
                    return ep != null ? t('field.place', { place: ep })
                      : e.table_no != null ? t('field.table_seat', { table: e.table_no, seat: e.seat_index ?? 0 })
                      : t('state.' + state)
                  })()}
                </span>
              </li>
            ))}
            {registered === 0 && <li className="text-ink/50">—</li>}
          </ul>
        </section>
      </div>

      {(standings.length > 0 || payouts.length > 0) && (
        <section className="mt-5 rounded-xl border border-line bg-paper p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t('field.standings')}</h2>
          {standings.length === 0 ? <p className="text-sm text-ink/50">{t('field.no_standings')}</p> : (
            <ol className="flex flex-col gap-1.5 text-sm">
              {standings.map(({ e, place }) => {
                const p = payoutByEntry.get(e.id)
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink/80">{t('field.place', { place: place ?? 1 })} · {e.user_id.slice(0, 8)}…</span>
                    {p && p.amount > 0 && <span className="font-medium text-emerald-700">+{coins(p.amount, locale)} xu</span>}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}
    </PokerShell>
  )
}
