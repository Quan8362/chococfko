// Structural validation for the rule engine. Returns typed issues keyed by FIELD PATH (never
// throws for expected invalid input) so the admin/server layer can localize and highlight fields.
// Pure & deterministic; no I/O; does not mutate input.

import {
  ALL_TIE_BREAK_TOKENS,
  type CompetitorComposition,
  type EventRuleSnapshot,
  type GroupStageRules,
  type HandicapRules,
  type KnockoutRules,
  type MatchRules,
  type RuleSet,
  type TieBreakToken,
} from './types.ts'
import { issue, type RuleValidationIssue, type ValidationResult } from './errors.ts'
import { getRulePreset } from './presets.ts'

function isIntGte(v: unknown, min: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min
}

// ── Competitor composition ──────────────────────────────────────────────────────────────────
export function validateCompetitorComposition(
  comp: CompetitorComposition,
  basePath = 'composition',
): ValidationResult {
  const issues: RuleValidationIssue[] = []
  const { kind, maleCount, femaleCount } = comp

  if (!isIntGte(maleCount, 0)) {
    issues.push(issue(`${basePath}.maleCount`, 'COMPOSITION_COUNT_INVALID', 'maleCount must be a non-negative integer'))
  }
  if (!isIntGte(femaleCount, 0)) {
    issues.push(issue(`${basePath}.femaleCount`, 'COMPOSITION_COUNT_INVALID', 'femaleCount must be a non-negative integer'))
  }
  if (issues.length === 0) {
    const total = maleCount + femaleCount
    const expected = kind === 'single' ? total === 1 : kind === 'pair' ? total === 2 : total >= 2
    if (!expected) {
      issues.push(issue(`${basePath}.kind`, 'COMPOSITION_TOTAL_INVALID', `member total (${total}) is invalid for kind "${kind}"`))
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true }
}

// ── Match rules ─────────────────────────────────────────────────────────────────────────────
export function validateMatchRules(rules: MatchRules, basePath: string): RuleValidationIssue[] {
  const out: RuleValidationIssue[] = []

  if (!isIntGte(rules.games_to_win, 1)) {
    out.push(issue(`${basePath}.games_to_win`, 'GAMES_TO_WIN_TOO_LOW', 'games_to_win must be an integer >= 1'))
  }
  if (!isIntGte(rules.max_games, 1) || rules.max_games < rules.games_to_win) {
    out.push(issue(`${basePath}.max_games`, 'MAX_GAMES_TOO_LOW', 'max_games must be an integer >= games_to_win'))
  }
  if (!isIntGte(rules.points_to_win, 1)) {
    out.push(issue(`${basePath}.points_to_win`, 'POINTS_TO_WIN_TOO_LOW', 'points_to_win must be an integer >= 1'))
  }
  if (!isIntGte(rules.win_by, 1)) {
    out.push(issue(`${basePath}.win_by`, 'WIN_BY_TOO_LOW', 'win_by must be an integer >= 1'))
  }
  // points_cap is optional; when present it must let the target be reached (>= points_to_win).
  // This is also the guarantee that a game can always end.
  if (rules.points_cap !== null) {
    if (!isIntGte(rules.points_cap, 1) || (isIntGte(rules.points_to_win, 1) && rules.points_cap < rules.points_to_win)) {
      out.push(issue(`${basePath}.points_cap`, 'POINTS_CAP_TOO_LOW', 'points_cap must be an integer >= points_to_win'))
    }
  }

  return out
}

// ── Tie-break order ─────────────────────────────────────────────────────────────────────────
export function validateTieBreakOrder(
  tokens: readonly TieBreakToken[],
  basePath: string,
): RuleValidationIssue[] {
  const out: RuleValidationIssue[] = []
  if (tokens.length === 0) {
    out.push(issue(basePath, 'TIE_BREAK_EMPTY', 'tie_break_order must contain at least one token'))
    return out
  }
  const seen = new Set<string>()
  tokens.forEach((tok, i) => {
    if (!ALL_TIE_BREAK_TOKENS.includes(tok)) {
      out.push(issue(`${basePath}[${i}]`, 'TIE_BREAK_UNKNOWN_TOKEN', `unknown tie-break token "${String(tok)}"`))
      return
    }
    if (seen.has(tok)) {
      out.push(issue(`${basePath}[${i}]`, 'TIE_BREAK_DUPLICATE', `duplicate tie-break token "${tok}"`))
    }
    seen.add(tok)
  })
  return out
}

// ── Group / knockout ────────────────────────────────────────────────────────────────────────
function validateGroupRules(group: GroupStageRules, basePath: string): RuleValidationIssue[] {
  const out: RuleValidationIssue[] = []
  out.push(...validateMatchRules(group.match, `${basePath}.match`))

  if (!isIntGte(group.win_table_points, 0)) {
    out.push(issue(`${basePath}.win_table_points`, 'TABLE_POINTS_INVALID', 'win_table_points must be a non-negative integer'))
  }
  if (!isIntGte(group.loss_table_points, 0)) {
    out.push(issue(`${basePath}.loss_table_points`, 'TABLE_POINTS_INVALID', 'loss_table_points must be a non-negative integer'))
  }
  if (
    isIntGte(group.win_table_points, 0) && isIntGte(group.loss_table_points, 0) &&
    group.win_table_points <= group.loss_table_points
  ) {
    out.push(issue(`${basePath}.win_table_points`, 'WIN_LOSS_POINTS_ORDER', 'a win must be worth strictly more than a loss'))
  }

  out.push(...validateTieBreakOrder(group.tie_break_order, `${basePath}.tie_break_order`))
  return out
}

function validateKnockoutRules(knockout: KnockoutRules, basePath: string): RuleValidationIssue[] {
  return validateMatchRules(knockout.match, `${basePath}.match`)
}

// ── Handicap ────────────────────────────────────────────────────────────────────────────────
export function validateHandicapRules(handicap: HandicapRules, basePath: string): RuleValidationIssue[] {
  const out: RuleValidationIssue[] = []
  if (!handicap.enabled) return out

  // A configured (non-pending) handicap MUST carry at least one valid entry. A pending one
  // (requires_configuration) may be empty — it is intentionally not-yet-ready, not malformed.
  if (!handicap.requires_configuration && handicap.entries.length === 0) {
    out.push(issue(`${basePath}.entries`, 'HANDICAP_MISSING_ENTRIES', 'an enabled, configured handicap needs at least one entry'))
  }

  handicap.entries.forEach((e, i) => {
    const comp = validateCompetitorComposition(
      { kind: e.kind, maleCount: e.maleCount, femaleCount: e.femaleCount },
      `${basePath}.entries[${i}]`,
    )
    const valueOk = typeof e.value === 'number' && Number.isInteger(e.value)
    if (!comp.ok || !valueOk) {
      out.push(issue(`${basePath}.entries[${i}]`, 'HANDICAP_ENTRY_INVALID', 'handicap entry has an invalid composition or value'))
    }
  })

  return out
}

// ── Whole rule set ──────────────────────────────────────────────────────────────────────────
// Validates the sporting rules regardless of preset provenance.
export function validateTournamentRules(rules: RuleSet): ValidationResult {
  const issues: RuleValidationIssue[] = [
    ...validateGroupRules(rules.group, 'group'),
    ...validateKnockoutRules(rules.knockout, 'knockout'),
    ...validateHandicapRules(rules.handicap, 'handicap'),
  ]
  return issues.length ? { ok: false, issues } : { ok: true }
}

// ── Whole event snapshot ────────────────────────────────────────────────────────────────────
// Validates rules PLUS metadata + category provenance. When the snapshot claims a preset, the
// preset is looked up in the registry (never matched by hardcoded name) and the category must be
// one the preset defines.
export function validateEventRuleSnapshot(snapshot: EventRuleSnapshot): ValidationResult {
  const issues: RuleValidationIssue[] = []
  const rulesResult = validateTournamentRules(snapshot.rules)
  if (!rulesResult.ok) issues.push(...rulesResult.issues)

  const { metadata, category } = snapshot

  if (!isIntGte(metadata.snapshot_version, 1)) {
    issues.push(issue('metadata.snapshot_version', 'SNAPSHOT_INCOMPLETE', 'snapshot_version must be an integer >= 1'))
  }

  if (metadata.source === 'preset') {
    if (typeof metadata.preset_key !== 'string' || metadata.preset_key.length === 0) {
      issues.push(issue('metadata.preset_key', 'PRESET_KEY_INVALID', 'preset source requires a preset_key'))
    }
    if (!isIntGte(metadata.preset_version, 1)) {
      issues.push(issue('metadata.preset_version', 'PRESET_VERSION_INVALID', 'preset source requires a preset_version'))
    }
    if (typeof metadata.preset_key === 'string' && isIntGte(metadata.preset_version, 1)) {
      const preset = getRulePreset(metadata.preset_key, metadata.preset_version)
      if (!preset) {
        issues.push(issue('metadata.preset_key', 'PRESET_KEY_INVALID', 'preset_key/version does not resolve to a known preset'))
      } else if (preset.variants.length > 0) {
        const known = preset.variants.map((v) => v.category)
        if (category === null || !known.includes(category)) {
          issues.push(issue('category', 'CATEGORY_UNKNOWN', `category "${String(category)}" is not defined by preset ${preset.key}`))
        }
      }
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true }
}
