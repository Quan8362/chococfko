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
export default function KnockoutWorkspace({
  tournamentId,
  eventId,
  seedSetup,
  workspace,
}: {
  tournamentId: string
  eventId: string
  seedSetup: KnockoutSeedSetup
  workspace: KnockoutWorkspaceData | null
}) {
  const t = useTranslations('admin_knockout_seeding')
  const tc = useTranslations('admin_tournament_groups')
  const tt = useTranslations('tournaments')
  const hasBracket = workspace !== null && workspace.hasBracket
  const [tab, setTab] = useState<Tab>(hasBracket ? 'results' : 'competitors')

  const tabs: { id: Tab; label: string; show: boolean; badge?: boolean }[] = [
    { id: 'competitors', label: tc('tab_competitors'), show: true },
    { id: 'seeding', label: t('tab_seeding'), show: true },
    { id: 'bracket', label: t('tab_bracket'), show: hasBracket },
    { id: 'results', label: t('tab_results'), show: hasBracket },
    { id: 'podium', label: t('tab_podium'), show: hasBracket, badge: workspace?.isComplete },
  ]
  const active = tabs.find((x) => x.id === tab)?.show ? tab : 'competitors'

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
      {active === 'competitors' && (
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
