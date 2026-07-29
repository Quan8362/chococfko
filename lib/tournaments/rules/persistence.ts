// Pure mapping between the rule-engine DOMAIN shapes (EventRuleSnapshot / RuleSet) and the DATABASE
// row shapes (tournament_rule_presets / tournament_event_rule_snapshots). No I/O — the repository
// layer (server-only) uses these to build write payloads and to project the safe public summary from
// a raw RPC row. Keeping the mapping pure means it is unit-tested without mocking Supabase.
//
// The DB is a persistence mirror only: the TypeScript domain (validation.ts / snapshot.ts) remains
// the authoritative validator. `schema_version` lets a future migration evolve the JSONB shape.

import {
  type EventRuleSnapshot,
  type RuleSet,
  type RuleSource,
  type TieBreakToken,
} from './types.ts'

// Bump when the persisted JSONB shape changes in a non-backward-compatible way.
export const RULE_SCHEMA_VERSION = 1

// DB allows one more source than the domain's RuleSource: 'default' (an event that took the built-in
// default rules without opting into a preset). The domain models default rules as a plain custom
// snapshot; the DB records it distinctly for reporting.
export type RuleSnapshotDbSource = 'default' | RuleSource

// The write payload for one row of tournament_event_rule_snapshots (snake_case to match the column
// names the repository passes straight to supabase.insert/upsert).
export interface EventRuleSnapshotRow {
  readonly event_id: string
  readonly source: RuleSnapshotDbSource
  readonly preset_key: string | null
  readonly preset_version: number | null
  readonly category: string | null
  readonly schema_version: number
  readonly snapshot_version: number
  readonly requires_configuration: boolean
  readonly payload: RuleSet
}

// Build the DB write payload from a domain snapshot. Mirrors the ters_preset_provenance CHECK: a
// non-preset snapshot carries no preset provenance, so those columns are forced null regardless of
// what the metadata happens to hold.
export function createSnapshotPayload(eventId: string, snapshot: EventRuleSnapshot): EventRuleSnapshotRow {
  const { metadata } = snapshot
  const isPreset = metadata.source === 'preset'
  return {
    event_id: eventId,
    source: metadata.source,
    preset_key: isPreset ? metadata.preset_key : null,
    preset_version: isPreset ? metadata.preset_version : null,
    category: snapshot.category,
    schema_version: RULE_SCHEMA_VERSION,
    snapshot_version: metadata.snapshot_version,
    requires_configuration: metadata.requires_configuration,
    payload: snapshot.rules,
  }
}

// ── Public-safe scoring summary ───────────────────────────────────────────────────────────────
// The minimal projection a Guest may see. Deliberately omits every admin/internal field (preset id,
// snapshot_version, requires_configuration internals, audit, optimistic-concurrency version).
export interface RuleMatchSummary {
  readonly pointsToWin: number
  readonly winBy: number
  readonly pointsCap: number | null
}

export interface PublicEventRuleSummary {
  readonly category: string | null
  readonly presetLabel: string | null
  readonly group: RuleMatchSummary
  readonly knockout: RuleMatchSummary
  readonly tieBreakOrder: readonly TieBreakToken[]
  readonly handicapEnabled: boolean
}

// The raw row shape returned by the tournament_public_event_rule_summary(uuid) RPC.
export interface RawPublicRuleSummaryRow {
  readonly category: string | null
  readonly preset_label: string | null
  readonly group_points_to_win: number | null
  readonly group_win_by: number | null
  readonly group_points_cap: number | null
  readonly knockout_points_to_win: number | null
  readonly knockout_win_by: number | null
  readonly knockout_points_cap: number | null
  readonly tie_break_order: unknown
  readonly handicap_enabled: boolean | null
}

function toTokens(value: unknown): TieBreakToken[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === 'string') as TieBreakToken[]) : []
}

// Map a raw RPC row to the safe summary. Returns null when the row cannot form a meaningful summary
// (missing scoring numbers) so the caller renders an empty state rather than a half-populated card.
export function toPublicEventRuleSummary(row: RawPublicRuleSummaryRow | null | undefined): PublicEventRuleSummary | null {
  if (!row) return null
  if (
    typeof row.group_points_to_win !== 'number' ||
    typeof row.knockout_points_to_win !== 'number'
  ) {
    return null
  }
  return {
    category: row.category ?? null,
    presetLabel: row.preset_label ?? null,
    group: {
      pointsToWin: row.group_points_to_win,
      winBy: typeof row.group_win_by === 'number' ? row.group_win_by : 1,
      pointsCap: typeof row.group_points_cap === 'number' ? row.group_points_cap : null,
    },
    knockout: {
      pointsToWin: row.knockout_points_to_win,
      winBy: typeof row.knockout_win_by === 'number' ? row.knockout_win_by : 1,
      pointsCap: typeof row.knockout_points_cap === 'number' ? row.knockout_points_cap : null,
    },
    tieBreakOrder: toTokens(row.tie_break_order),
    handicapEnabled: row.handicap_enabled === true,
  }
}
