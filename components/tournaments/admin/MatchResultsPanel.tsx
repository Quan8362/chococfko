'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import ScoreEditor from './ScoreEditor'
import ScoreLine from '../ScoreLine'
import type { CompetitorRow, GroupRow, MatchView } from '@/lib/tournaments/admin/types'
import type { EventScoringRuleView } from '@/lib/tournaments/rules'

// "Lịch và kết quả" tab: the group schedule grouped by group → round, each match showing its result
// (games won + per-game scores + winner) or a "nhập tỉ số" button that opens the ScoreEditor.
// Read-only once a knockout has been seeded downstream (corrections are a Prompt-08 reset path).
export default function MatchResultsPanel({
  tournamentId,
  eventId,
  groups,
  matches,
  competitors,
  hasKnockout,
  scoringRules,
}: {
  tournamentId: string
  eventId: string
  groups: GroupRow[]
  matches: MatchView[]
  competitors: CompetitorRow[]
  hasKnockout: boolean
  scoringRules?: EventScoringRuleView
}) {
  const t = useTranslations('admin_match_scores')
  const tm = useTranslations('admin_group_matches')
  const [openMatchId, setOpenMatchId] = useState<string | null>(null)

  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : '—')
  }, [competitors])

  const byGroup = useMemo(() => {
    const map = new Map<string, MatchView[]>()
    for (const m of matches) {
      const key = m.groupId ?? '__none__'
      const list = map.get(key)
      if (list) list.push(m)
      else map.set(key, [m])
    }
    return map
  }, [matches])

  const openMatch = matches.find((m) => m.id === openMatchId) ?? null

  if (matches.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13px] text-muted">{tm('schedule_empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {hasKnockout && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-[13px] text-amber-700">{t('locked_knockout')}</p>
        </div>
      )}

      {groups.map((g) => {
        const groupMatches = (byGroup.get(g.id) ?? [])
          .slice()
          .sort((a, b) =>
            a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchNumber - b.matchNumber,
          )
        if (groupMatches.length === 0) return null
        const done = groupMatches.filter((m) => m.status === 'completed').length
        const rounds = new Map<number, MatchView[]>()
        for (const m of groupMatches) {
          const list = rounds.get(m.roundNumber)
          if (list) list.push(m)
          else rounds.set(m.roundNumber, [m])
        }
        return (
          <div key={g.id} className="border border-line rounded-xl overflow-hidden">
            <div className="bg-cream px-4 py-2 border-b border-line flex items-baseline justify-between gap-2">
              <span className="font-serif font-bold text-[14px] text-ink">{tm('group', { name: g.name })}</span>
              <span className="text-[12px] text-muted">
                {t('progress', { done, total: groupMatches.length })}
              </span>
            </div>
            <div className="p-3 space-y-3">
              {Array.from(rounds.keys())
                .sort((a, b) => a - b)
                .map((rn) => (
                  <div key={rn}>
                    <p className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                      {tm('round', { number: rn })}
                    </p>
                    <ul className="space-y-1.5">
                      {rounds.get(rn)!.map((m) => {
                        const completed = m.status === 'completed'
                        const aWon = completed && m.winnerId === m.competitorAId
                        const bWon = completed && m.winnerId === m.competitorBId
                        return (
                          <li
                            key={m.id}
                            className="rounded-lg border border-line bg-cream/50 px-2.5 py-2 flex items-center gap-2"
                          >
                            <span className="flex-none w-5 text-[11px] font-semibold text-muted">{m.matchNumber}</span>
                            <span
                              className={`flex-1 min-w-0 text-right truncate text-[13px] ${aWon ? 'font-bold text-ink' : 'text-ink'}`}
                            >
                              {aWon && <span className="text-teal mr-1" aria-hidden>✓</span>}
                              {nameOf(m.competitorAId)}
                            </span>
                            <span className="flex-none text-center min-w-[64px] max-w-[168px] text-[14px] font-bold text-ink">
                              {completed ? (
                                <ScoreLine
                                  match={m}
                                  completedLabel={t('completed_no_score')}
                                  scoreAria={(scores) => t('score_aria', { scores })}
                                />
                              ) : (
                                <span className="text-[11px] font-normal text-muted">{tm('vs')}</span>
                              )}
                            </span>
                            <span
                              className={`flex-1 min-w-0 truncate text-[13px] ${bWon ? 'font-bold text-ink' : 'text-ink'}`}
                            >
                              {nameOf(m.competitorBId)}
                              {bWon && <span className="text-teal ml-1" aria-hidden>✓</span>}
                            </span>
                            <button
                              type="button"
                              disabled={hasKnockout || m.status === 'cancelled'}
                              onClick={() => setOpenMatchId(m.id)}
                              className={`flex-none font-semibold text-[11.5px] px-2.5 py-1 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                completed
                                  ? 'border border-line bg-paper text-muted hover:text-rose'
                                  : 'bg-rose text-white hover:bg-rose-deep'
                              }`}
                            >
                              {completed ? t('edit') : t('enter_score')}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        )
      })}

      {openMatch && (
        <ScoreEditor
          tournamentId={tournamentId}
          eventId={eventId}
          match={openMatch}
          nameA={nameOf(openMatch.competitorAId)}
          nameB={nameOf(openMatch.competitorBId)}
          rule={scoringRules?.group ?? null}
          ruleSource={scoringRules?.source}
          handicapBlocked={scoringRules?.handicapBlocked ?? false}
          handicap={scoringRules?.handicap}
          onClose={() => setOpenMatchId(null)}
        />
      )}
    </div>
  )
}
