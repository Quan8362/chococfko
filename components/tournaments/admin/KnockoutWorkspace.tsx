'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import CompetitorManager from './CompetitorManager'
import SeedEditor from './SeedEditor'
import BracketView from './BracketView'
import KnockoutResultsPanel from './KnockoutResultsPanel'
import PodiumPanel from './PodiumPanel'
import WorkspaceTabs from './WorkspaceTabs'
import type { KnockoutSeedSetup, KnockoutWorkspace as KnockoutWorkspaceData } from '@/lib/tournaments/admin/types'

type Tab = 'competitors' | 'seeding' | 'bracket' | 'results' | 'podium'

// Tabbed workspace for a knockout-only event: Xếp nhánh / Nhánh đấu / Kết quả / Thành tích. The
// bracket/results/podium tabs appear once the bracket has been generated. No group tabs are shown.
// Convenience UI capabilities (see EventWorkspace). A scorekeeper gets only { score } → the bracket
// view / results / podium, and none of the roster or seeding management. Server re-checks mutations.
export interface KnockoutWorkspaceCaps {
  competitors?: boolean
  bracket?: boolean
  score?: boolean
}

export default function KnockoutWorkspace({
  tournamentId,
  eventId,
  seedSetup,
  workspace,
  caps = { competitors: true, bracket: true, score: true },
}: {
  tournamentId: string
  eventId: string
  seedSetup: KnockoutSeedSetup
  workspace: KnockoutWorkspaceData | null
  caps?: KnockoutWorkspaceCaps
}) {
  const t = useTranslations('admin_knockout_seeding')
  const tc = useTranslations('admin_tournament_groups')
  const tt = useTranslations('tournaments')
  const c = caps
  const hasBracket = workspace !== null && workspace.hasBracket
  const [tab, setTab] = useState<Tab>(hasBracket ? 'results' : 'competitors')

  const tabs: { id: Tab; label: string; show: boolean; badge?: boolean }[] = [
    { id: 'competitors', label: tc('tab_competitors'), show: c.competitors !== false },
    { id: 'seeding', label: t('tab_seeding'), show: c.bracket !== false },
    { id: 'bracket', label: t('tab_bracket'), show: hasBracket && c.score !== false },
    { id: 'results', label: t('tab_results'), show: hasBracket && c.score !== false },
    { id: 'podium', label: t('tab_podium'), show: hasBracket && c.score !== false, badge: workspace?.isComplete },
  ]
  const visibleTabs = tabs.filter((x) => x.show)
  const active = visibleTabs.some((x) => x.id === tab) ? tab : (visibleTabs[0]?.id ?? 'competitors')

  return (
    <div>
      <WorkspaceTabs
        tabs={tabs}
        active={active}
        onSelect={setTab}
        idPrefix="ko"
        ariaLabel={tt('tabs_label')}
        badgeClassName="bg-teal"
      />

      <div role="tabpanel" id="ko-panel" aria-labelledby={`ko-tab-${active}`} tabIndex={0} className="focus:outline-none">
      {visibleTabs.length === 0 && (
        <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
          <p className="text-[13px] text-muted">{tt('scorekeeper_waiting')}</p>
        </div>
      )}
      {active === 'competitors' && c.competitors !== false && (
        <CompetitorManager
          tournamentId={tournamentId}
          eventId={eventId}
          competitors={seedSetup.competitors}
          locked={seedSetup.hasBracket}
          showSeed={true}
        />
      )}

      {active === 'seeding' && (
        <SeedEditor
          tournamentId={tournamentId}
          eventId={eventId}
          version={seedSetup.event.version}
          thirdPlaceEnabled={seedSetup.event.thirdPlaceEnabled}
          competitors={seedSetup.competitors}
          seededIds={seedSetup.seededIds}
          unassignedIds={seedSetup.unassignedIds}
          hasBracket={seedSetup.hasBracket}
          hasResults={workspace?.hasResults ?? false}
        />
      )}

      {active === 'bracket' && workspace && (
        <BracketView rounds={workspace.rounds} thirdPlaceMatch={workspace.thirdPlaceMatch} competitors={workspace.competitors} />
      )}

      {active === 'results' && workspace && (
        <KnockoutResultsPanel
          tournamentId={tournamentId}
          eventId={eventId}
          rounds={workspace.rounds}
          thirdPlaceMatch={workspace.thirdPlaceMatch}
          competitors={workspace.competitors}
        />
      )}

      {active === 'podium' && workspace && (
        <PodiumPanel podium={workspace.podium} competitors={workspace.competitors} isComplete={workspace.isComplete} />
      )}
      </div>
    </div>
  )
}
