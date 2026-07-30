'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import BracketView from './BracketView'
import KnockoutResultsPanel from './KnockoutResultsPanel'
import PodiumPanel from './PodiumPanel'
import {
  saveGroupKnockoutMatchResult,
  clearGroupKnockoutMatchResult,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { BranchWorkspace, CompetitorRow } from '@/lib/tournaments/admin/types'
import type { EventScoringRuleView } from '@/lib/tournaments/rules'

type SubTab = 'bracket' | 'results' | 'podium'

// One branch (championship / consolation) of a group_knockout event: its bracket, interactive results
// and podium. Reuses the knockout-only bracket / results / podium components, but the score editor is
// driven by the group_knockout branch actions (progression + podium + completion stay within the branch).
export default function GroupKnockoutBranchPanel({
  tournamentId,
  eventId,
  branch,
  competitors,
  scoringRules,
}: {
  tournamentId: string
  eventId: string
  branch: BranchWorkspace
  competitors: CompetitorRow[]
  scoringRules?: EventScoringRuleView
}) {
  const t = useTranslations('admin_knockout_seeding')
  const [tab, setTab] = useState<SubTab>(branch.hasBracket ? 'results' : 'bracket')

  const tabs: { id: SubTab; label: string; badge?: boolean }[] = [
    { id: 'bracket', label: t('tab_bracket') },
    { id: 'results', label: t('tab_results') },
    { id: 'podium', label: t('tab_podium'), badge: branch.isComplete },
  ]

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-line/70 mb-4 overflow-x-auto">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`relative flex-none px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              tab === x.id ? 'text-teal' : 'text-muted hover:text-ink'
            }`}
          >
            {x.label}
            {x.badge && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-teal align-middle" aria-hidden />}
            {tab === x.id && <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-teal rounded-full" />}
          </button>
        ))}
      </div>

      {tab === 'bracket' && (
        <BracketView rounds={branch.rounds} thirdPlaceMatch={branch.thirdPlaceMatch} competitors={competitors} />
      )}

      {tab === 'results' && (
        <KnockoutResultsPanel
          tournamentId={tournamentId}
          eventId={eventId}
          rounds={branch.rounds}
          thirdPlaceMatch={branch.thirdPlaceMatch}
          competitors={competitors}
          scoringRules={scoringRules}
          saveAction={saveGroupKnockoutMatchResult}
          clearAction={clearGroupKnockoutMatchResult}
        />
      )}

      {tab === 'podium' && (
        <PodiumPanel podium={branch.podium} competitors={competitors} isComplete={branch.isComplete} />
      )}
    </div>
  )
}
