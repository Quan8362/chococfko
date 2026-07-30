'use server'

// Thin 'use server' wrappers for the tournament RULE ENGINE admin actions. All authorization,
// anti-IDOR verification, the conservative safety guard, pure-engine validation, the service-role
// mutation, the audit write and revalidation live in the server-only service
// (lib/tournaments/admin/ruleService.ts). These wrappers add NOTHING that could bypass those checks;
// they exist only so a Client Component (RuleWorkspace) can invoke them. Shared by BOTH the
// Site-Admin mount (/admin/giai-dau) and the scoped mount (/quan-ly-giai-dau) — the same
// checkTournamentPermission(tournamentId, 'rules.manage') gate admits a Site Admin OR a Manager and
// denies a Scorekeeper / ordinary user / anonymous caller server-side.

import {
  applyRulePresetToEvent,
  createCustomEventRuleSnapshot,
  updateEventRuleSnapshot,
  acknowledgeRuleWarning,
  resetEventRuleSnapshotToPreset,
  deleteEventRuleSnapshot,
  type ApplyPresetInput,
  type CreateCustomInput,
  type UpdateSnapshotInput,
  type AcknowledgeWarningInput,
  type ResetSnapshotInput,
  type DeleteSnapshotInput,
} from '@/lib/tournaments/admin/ruleService'
import type { RuleMutationResult, RuleAckResult, RuleDeleteResult } from '@/lib/tournaments/rules'

export async function applyRulePresetAction(input: ApplyPresetInput): Promise<RuleMutationResult> {
  return applyRulePresetToEvent(input)
}

export async function createCustomRuleSnapshotAction(input: CreateCustomInput): Promise<RuleMutationResult> {
  return createCustomEventRuleSnapshot(input)
}

export async function updateRuleSnapshotAction(input: UpdateSnapshotInput): Promise<RuleMutationResult> {
  return updateEventRuleSnapshot(input)
}

export async function acknowledgeRuleWarningAction(input: AcknowledgeWarningInput): Promise<RuleAckResult> {
  return acknowledgeRuleWarning(input)
}

export async function resetRuleSnapshotToPresetAction(input: ResetSnapshotInput): Promise<RuleMutationResult> {
  return resetEventRuleSnapshotToPreset(input)
}

export async function deleteRuleSnapshotAction(input: DeleteSnapshotInput): Promise<RuleDeleteResult> {
  return deleteEventRuleSnapshot(input)
}
