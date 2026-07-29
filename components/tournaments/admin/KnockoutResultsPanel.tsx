'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import KnockoutScoreEditor, { type KnockoutSaveAction, type KnockoutClearAction } from './KnockoutScoreEditor'
import type { CompetitorRow, KnockoutMatchView, KnockoutRoundView } from '@/lib/tournaments/admin/types'

// Interactive results list: every knockout match grouped by round (+ the third-place match). A
// ready/completed pairing opens the score editor; BYE and not-yet-decided (pending) matches are
// shown read-only. The server is the authority for progression, correction safety and completion.
export default function KnockoutResultsPanel({
  tournamentId,
  eventId,
  rounds,
  thirdPlaceMatch,
  competitors,
  saveAction,
  clearAction,
}: {
  tournamentId: string
  eventId: string
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  competitors: CompetitorRow[]
  saveAction?: KnockoutSaveAction
  clearAction?: KnockoutClearAction
}) {
  const t = useTranslations('admin_knockout_results')
  const tb = useTranslations('admin_knockout_bracket')
  const [editing, setEditing] = useState<KnockoutMatchView | null>(null)

  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : null)
  }, [competitors])

  const roundName = (label: string) => {
    const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
    if (known.includes(label)) return tb(`label_${label}`)
    const m = /^round_(\d+)$/.exec(label)
    return m ? tb('label_generic', { n: m[1] }) : label
  }

  const editable = (m: KnockoutMatchView) =>
    (m.status === 'ready' || m.status === 'completed') && !!m.competitorAId && !!m.competitorBId

  const Row = ({ m }: { m: KnockoutMatchView }) => {
    const a = nameOf(m.competitorAId)
    const b = nameOf(m.competitorBId)
    const done = m.status === 'completed'
    return (
      <div className="flex items-center gap-2 rounded-lg bg-cream border border-line px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`flex-1 text-[13px] truncate text-right ${done && m.winnerId === m.competitorAId ? 'font-bold text-teal' : a ? 'text-ink' : 'text-muted italic'}`}>
              {a ?? tb('tbd')}
            </span>
            {done ? (
              <span className="flex-none text-[13px] font-bold text-ink px-1">{m.gamesWonA}–{m.gamesWonB}</span>
            ) : (
              <span className="flex-none text-[10.5px] text-muted px-1">{tb('vs')}</span>
            )}
            <span className={`flex-1 text-[13px] truncate ${done && m.winnerId === m.competitorBId ? 'font-bold text-teal' : b ? 'text-ink' : 'text-muted italic'}`}>
              {b ?? tb('tbd')}
            </span>
          </div>
        </div>
        <div className="flex-none">
          {editable(m) ? (
            <button
              type="button"
              onClick={() => setEditing(m)}
              className="font-semibold text-[12px] px-3 py-1.5 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all"
            >
              {done ? t('edit_result') : t('enter_result')}
            </button>
          ) : (
            <span className="text-[10.5px] text-muted px-2">
              {m.status === 'bye' ? tb('status_bye') : tb('status_pending')}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <div key={round.roundNumber}>
          <h3 className="text-[12.5px] font-bold text-teal mb-1.5">{roundName(round.label)}</h3>
          <div className="space-y-1.5">
            {round.matches.map((m) => (
              <Row key={m.id} m={m} />
            ))}
          </div>
        </div>
      ))}

      {thirdPlaceMatch && (
        <div>
          <h3 className="text-[12.5px] font-bold text-amber-600 mb-1.5">{tb('label_third_place')}</h3>
          <Row m={thirdPlaceMatch} />
        </div>
      )}

      {editing && (
        <KnockoutScoreEditor
          tournamentId={tournamentId}
          eventId={eventId}
          match={editing}
          nameA={nameOf(editing.competitorAId) ?? tb('tbd')}
          nameB={nameOf(editing.competitorBId) ?? tb('tbd')}
          onClose={() => setEditing(null)}
          saveAction={saveAction}
          clearAction={clearAction}
        />
      )}
    </div>
  )
}
