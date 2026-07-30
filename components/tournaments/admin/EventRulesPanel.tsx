// SERVER component: the data-loading shell for the "Luật thi đấu" rule tab. Shared by the Site-Admin
// and scoped event pages so both mounts render one implementation. It reads the current snapshot and
// the available presets via the ADMIN (service-role) query layer — safe here because it is a Server
// Component and the page already gated the viewer — then hands plain, serializable data to the
// RuleWorkspace Client Component. The conservative safety guard is computed from DB match counts.

import {
  getEventRuleSnapshotForAdmin,
  listRulePresetsForPicker,
} from '@/lib/tournaments/admin/ruleQueries'
import { evaluateRuleMutationGuard, type RuleSnapshotView } from '@/lib/tournaments/rules'
import RuleWorkspace, { type RuleGuardCode } from './RuleWorkspace'

export default async function EventRulesPanel({
  tournamentId,
  eventId,
  canManage,
  matchCount,
  completedMatchCount,
}: {
  tournamentId: string
  eventId: string
  canManage: boolean
  matchCount: number
  completedMatchCount: number
}) {
  const [row, presets] = await Promise.all([
    getEventRuleSnapshotForAdmin(eventId),
    listRulePresetsForPicker(),
  ])

  const snapshot: RuleSnapshotView | null = row
    ? {
        id: row.id,
        eventId: row.eventId,
        source: row.source,
        presetKey: row.presetKey,
        presetVersion: row.presetVersion,
        category: row.category,
        snapshotVersion: row.snapshotVersion,
        requiresConfiguration: row.requiresConfiguration,
        version: row.version,
        rules: row.rules,
      }
    : null

  const g = evaluateRuleMutationGuard({ matchCount, completedMatchCount })
  const guard: RuleGuardCode = g.ok ? null : g.code

  return (
    <RuleWorkspace
      tournamentId={tournamentId}
      eventId={eventId}
      canManage={canManage}
      guard={guard}
      snapshot={snapshot}
      presets={presets}
    />
  )
}
