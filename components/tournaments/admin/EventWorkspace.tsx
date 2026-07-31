'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import CompetitorManager from './CompetitorManager'
import GroupAssignmentBoard from './GroupAssignmentBoard'
import MatchResultsPanel from './MatchResultsPanel'
import StandingsTable from './StandingsTable'
import TieResolutionPanel from './TieResolutionPanel'
import GroupKnockoutSeedEditor from './GroupKnockoutSeedEditor'
import GroupKnockoutBranchPanel from './GroupKnockoutBranchPanel'
import WorkspaceTabs from './WorkspaceTabs'
import type {
  CompetitorRow,
  GroupSetup,
  ScoringWorkspace,
  GroupKnockoutSeedSetup,
  GroupKnockoutWorkspace,
} from '@/lib/tournaments/admin/types'
import type { GroupStageFormat } from '@/lib/tournaments/domain/group-assignment'

type Tab = 'competitors' | 'groups' | 'results' | 'standings' | 'ties' | 'gk_seeding' | 'gk_championship' | 'gk_consolation'

// Tabbed workspace for one event: Vận động viên / Chia bảng / Lịch & kết quả / Bảng xếp hạng /
// Phân định. The group tabs only exist for round_robin & group_knockout (groupSetup non-null);
// scoring/standings/ties appear once the schedule is generated (scoring non-null).
// Convenience UI capabilities — which tabs a viewer may use. Defaults to ALL (the Site-Admin mount).
// A scorekeeper on the scoped surface gets only { score } → sees Results / Standings / bracket score
// panels and none of the roster/group/seeding/tie management. The server re-checks every mutation.
export interface EventWorkspaceCaps {
  competitors?: boolean
  groups?: boolean
  score?: boolean
  ties?: boolean
  bracket?: boolean
}

export default function EventWorkspace({
  tournamentId,
  eventId,
  competitors,
  showSeed,
  showComposition = false,
  locked,
  groupSetup,
  scoring,
  groupKnockoutSeed,
  groupKnockoutWorkspace,
  caps = { competitors: true, groups: true, score: true, ties: true, bracket: true },
}: {
  tournamentId: string
  eventId: string
  competitors: CompetitorRow[]
  showSeed: boolean
  showComposition?: boolean
  locked: boolean
  groupSetup: GroupSetup | null
  scoring: ScoringWorkspace | null
  groupKnockoutSeed: GroupKnockoutSeedSetup | null
  groupKnockoutWorkspace: GroupKnockoutWorkspace | null
  caps?: EventWorkspaceCaps
}) {
  const t = useTranslations('admin_tournament_groups')
  const ts = useTranslations('admin_group_standings')
  const tg = useTranslations('admin_group_knockout')
  const tt = useTranslations('tournaments')
  const [tab, setTab] = useState<Tab>('competitors')

  const hasGroups = groupSetup !== null
  const hasSchedule = scoring !== null && scoring.matches.length > 0
  const needsTieAttention =
    scoring !== null && (scoring.hasBlockingTie || scoring.standings.some((g) => g.hasOverride))

  // group_knockout knockout stage: the seeding tab appears once the group stage is ready (or a bracket
  // exists); the branch tabs appear once brackets are generated.
  const isGk = groupKnockoutSeed !== null
  const showSeeding = isGk && (groupKnockoutSeed!.readyToSeed || groupKnockoutSeed!.hasBrackets)
  const hasBrackets = groupKnockoutWorkspace !== null && groupKnockoutWorkspace.hasBrackets
  const showConsolationBranch = hasBrackets && groupKnockoutWorkspace!.consolation !== null

  // Capability gate layered on top of the data-availability gate: a tab shows only when its data
  // exists AND the viewer's role may use it. Results/standings/bracket score panels ride on `score`.
  const c = caps
  const tabs: { id: Tab; label: string; show: boolean; badge?: boolean }[] = [
    { id: 'competitors', label: t('tab_competitors'), show: c.competitors !== false },
    { id: 'groups', label: t('tab_groups'), show: hasGroups && c.groups !== false },
    { id: 'results', label: ts('tab_results'), show: hasSchedule && c.score !== false },
    { id: 'standings', label: ts('tab_standings'), show: hasSchedule && c.score !== false },
    { id: 'ties', label: ts('tab_ties'), show: needsTieAttention && c.ties !== false, badge: scoring?.hasBlockingTie },
    { id: 'gk_seeding', label: tg('tab_seeding'), show: showSeeding && c.bracket !== false },
    { id: 'gk_championship', label: tg('tab_championship'), show: hasBrackets && c.score !== false, badge: groupKnockoutWorkspace?.championship.isComplete },
    { id: 'gk_consolation', label: tg('tab_consolation'), show: showConsolationBranch && c.score !== false, badge: groupKnockoutWorkspace?.consolation?.isComplete },
  ]

  const visibleTabs = tabs.filter((x) => x.show)
  const active = visibleTabs.some((x) => x.id === tab) ? tab : (visibleTabs[0]?.id ?? 'competitors')

  return (
    <div>
      {scoring && hasSchedule && <StatusBanner scoring={scoring} />}

      <WorkspaceTabs
        tabs={tabs}
        active={active}
        onSelect={setTab}
        idPrefix="ev"
        ariaLabel={tt('tabs_label')}
      />

      <div role="tabpanel" id="ev-panel" aria-labelledby={`ev-tab-${active}`} tabIndex={0} className="focus:outline-none">
      {visibleTabs.length === 0 && (
        <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
          <p className="text-[13px] text-muted">{tt('scorekeeper_waiting')}</p>
        </div>
      )}
      {active === 'competitors' && c.competitors !== false && (
        <CompetitorManager
          tournamentId={tournamentId}
          eventId={eventId}
          competitors={competitors}
          locked={locked}
          showSeed={showSeed}
          showComposition={showComposition}
        />
      )}

      {active === 'groups' && groupSetup && (
        <GroupAssignmentBoard
          tournamentId={tournamentId}
          eventId={eventId}
          format={groupSetup.event.format as GroupStageFormat}
          version={groupSetup.event.version}
          desiredGroupCount={groupSetup.event.groupCount}
          winnerQualifiersPerGroup={groupSetup.event.winnerQualifiersPerGroup}
          consolationQualifiersPerGroup={groupSetup.event.consolationQualifiersPerGroup}
          competitors={competitors}
          groups={groupSetup.groups}
          memberships={groupSetup.memberships}
          unassignedIds={groupSetup.unassignedIds}
          locked={groupSetup.matchCount > 0}
          hasResults={groupSetup.completedMatchCount > 0 || groupSetup.hasScores}
          hasKnockout={groupSetup.hasKnockoutMatches}
        />
      )}

      {active === 'results' && scoring && (
        <MatchResultsPanel
          tournamentId={tournamentId}
          eventId={eventId}
          groups={scoring.groups}
          matches={scoring.matches}
          competitors={competitors}
          hasKnockout={scoring.hasKnockout}
          scoringRules={scoring.scoringRules}
        />
      )}

      {active === 'standings' && scoring && (
        <StandingsTable
          standings={scoring.standings}
          competitors={competitors}
          format={scoring.event.format}
          winnerQualifiers={scoring.event.winnerQualifiersPerGroup}
          consolationQualifiers={scoring.event.consolationQualifiersPerGroup}
        />
      )}

      {active === 'ties' && scoring && (
        <TieResolutionPanel
          tournamentId={tournamentId}
          eventId={eventId}
          eventVersion={scoring.event.version}
          standings={scoring.standings}
          competitors={competitors}
          hasKnockout={scoring.hasKnockout}
        />
      )}

      {active === 'gk_seeding' && groupKnockoutSeed && (
        <GroupKnockoutSeedEditor tournamentId={tournamentId} eventId={eventId} setup={groupKnockoutSeed} />
      )}

      {active === 'gk_championship' && groupKnockoutWorkspace && (
        <GroupKnockoutBranchPanel
          tournamentId={tournamentId}
          eventId={eventId}
          branch={groupKnockoutWorkspace.championship}
          competitors={groupKnockoutWorkspace.competitors}
          scoringRules={groupKnockoutWorkspace.scoringRules}
        />
      )}

      {active === 'gk_consolation' && groupKnockoutWorkspace && groupKnockoutWorkspace.consolation && (
        <GroupKnockoutBranchPanel
          tournamentId={tournamentId}
          eventId={eventId}
          branch={groupKnockoutWorkspace.consolation}
          competitors={groupKnockoutWorkspace.competitors}
          scoringRules={groupKnockoutWorkspace.scoringRules}
        />
      )}
      </div>
    </div>
  )
}

// Compact derived-status banner: where the group stage stands (in progress / blocked by tie / ready
// for knockout / completed). Reflects the pure-engine computed status, not just the stored one.
function StatusBanner({ scoring }: { scoring: ScoringWorkspace }) {
  const t = useTranslations('admin_group_standings')
  const s = scoring.computedStatus
  let tone = 'bg-cream border-line text-muted'
  let msg = t('status_in_progress')
  if (s === 'group_stage') {
    msg = t('status_in_progress')
  } else if (s === 'group_stage_completed' && scoring.hasBlockingTie) {
    tone = 'bg-amber-50 border-amber-200 text-amber-700'
    msg = t('status_blocked')
  } else if (s === 'knockout_ready') {
    tone = 'bg-teal-soft border-teal/25 text-teal'
    msg = t('status_knockout_ready')
  } else if (s === 'completed') {
    tone = 'bg-teal-soft border-teal/25 text-teal'
    msg = t('status_completed')
  } else if (s === 'group_stage_completed') {
    tone = 'bg-cream border-line text-ink'
    msg = t('status_group_completed')
  }
  return (
    <div className={`rounded-lg border px-3 py-2 mb-4 ${tone}`}>
      <p className="text-[12.5px] font-medium">{msg}</p>
    </div>
  )
}
