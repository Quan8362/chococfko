// Snapshot lifecycle: deep-copy a preset (or a custom rule set) into an immutable EventRuleSnapshot,
// override it after copying, and serialize it deterministically. Pure & deterministic.
//
// Core invariants:
//   • A snapshot NEVER shares a mutable reference with the preset it came from — editing the preset
//     later cannot change an existing snapshot, and overriding a snapshot cannot change the preset.
//   • Serialization is canonical (keys sorted) so equal snapshots always serialize identically.

import {
  type EventRuleSnapshot,
  type GroupStageRules,
  type HandicapRules,
  type MatchRules,
  type RulePreset,
  type RuleSet,
  type RuleSnapshotMetadata,
  type RuleSource,
} from './types.ts'
import { RuleEngineError } from './errors.ts'

// Recursively freeze a plain-data value (objects & arrays) so a snapshot is immutable at runtime.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

// Deep-copy plain data via a JSON round-trip. All rule values are number/string/boolean/null/array,
// so this is loss-free AND guarantees no reference is shared with the source.
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// A handicap needs configuration when it is enabled but its values are not yet confirmed (flagged
// pending, or simply has no entries).
export function requiresConfiguration(rules: RuleSet): boolean {
  const h = rules.handicap
  return h.enabled && (h.requires_configuration || h.entries.length === 0)
}

// Build a snapshot from an arbitrary rule set. Deep-copies the rules and freezes the result.
export function createEventRuleSnapshot(input: {
  readonly rules: RuleSet
  readonly source: RuleSource
  readonly presetKey?: string | null
  readonly presetVersion?: number | null
  readonly category?: string | null
  readonly snapshotVersion?: number
}): EventRuleSnapshot {
  const rules = deepClone(input.rules)
  const metadata: RuleSnapshotMetadata = {
    preset_key: input.presetKey ?? null,
    preset_version: input.presetVersion ?? null,
    source: input.source,
    snapshot_version: input.snapshotVersion ?? 1,
    requires_configuration: requiresConfiguration(rules),
  }
  return deepFreeze({ metadata, category: input.category ?? null, rules })
}

// Deep-copy a preset variant into a fresh event snapshot. Throws UNKNOWN_CATEGORY if the preset does
// not define the requested category (categories are never arbitrary strings).
export function applyRulePreset(input: {
  readonly preset: RulePreset
  readonly category: string
}): EventRuleSnapshot {
  const variant = input.preset.variants.find((v) => v.category === input.category)
  if (!variant) {
    throw new RuleEngineError('UNKNOWN_CATEGORY', 'Preset does not define this category', {
      presetKey: input.preset.key, category: input.category,
      known: input.preset.variants.map((v) => v.category),
    })
  }
  return createEventRuleSnapshot({
    rules: variant.rules,
    source: 'preset',
    presetKey: input.preset.key,
    presetVersion: input.preset.version,
    category: input.category,
    snapshotVersion: 1,
  })
}

// ── Override after copy ─────────────────────────────────────────────────────────────────────
export interface RuleSetPatch {
  readonly group?: Partial<Omit<GroupStageRules, 'match'>> & { readonly match?: Partial<MatchRules> }
  readonly knockout?: { readonly match?: Partial<MatchRules> }
  readonly handicap?: Partial<HandicapRules>
}

function mergeRuleSet(base: RuleSet, patch: RuleSetPatch): RuleSet {
  return {
    group: {
      ...base.group,
      ...patch.group,
      match: { ...base.group.match, ...patch.group?.match },
      tie_break_order: patch.group?.tie_break_order ?? base.group.tie_break_order,
    },
    knockout: {
      match: { ...base.knockout.match, ...patch.knockout?.match },
    },
    handicap: {
      ...base.handicap,
      ...patch.handicap,
      entries: patch.handicap?.entries ?? base.handicap.entries,
    },
  }
}

// Produce a NEW snapshot with the patch applied over a deep copy of the current rules. Preset
// provenance is preserved (so the event still knows where it came from) while snapshot_version is
// bumped and requires_configuration recomputed. The input snapshot and any preset are untouched.
export function overrideSnapshotRules(
  snapshot: EventRuleSnapshot,
  patch: RuleSetPatch,
): EventRuleSnapshot {
  const merged = mergeRuleSet(deepClone(snapshot.rules), patch)
  return createEventRuleSnapshot({
    rules: merged,
    source: snapshot.metadata.source,
    presetKey: snapshot.metadata.preset_key,
    presetVersion: snapshot.metadata.preset_version,
    category: snapshot.category,
    snapshotVersion: snapshot.metadata.snapshot_version + 1,
  })
}

// ── Deterministic serialization ─────────────────────────────────────────────────────────────
// Canonical JSON with recursively sorted object keys. Arrays keep their order (order is meaningful,
// e.g. tie_break_order). Two structurally-equal snapshots always produce byte-identical output.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

export function serializeRuleSnapshot(snapshot: EventRuleSnapshot): string {
  return JSON.stringify(canonicalize(snapshot))
}
