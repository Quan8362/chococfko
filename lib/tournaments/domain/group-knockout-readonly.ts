// Pure read-only view model for a group_knockout event whose OFFICIAL brackets have already been
// generated. Its single job: turn the authoritative data — the persisted seed slots (seed ORDER +
// qualification tokens) and the OFFICIAL first-round matches (who actually plays whom, BYEs frozen at
// generation) — into the rows the "Xếp nhánh" tab renders once seeds are locked. It deliberately does
// NOT re-run the bracket engine: after generation the played bracket is DB truth, so the first-round
// pairings come straight from the stored matches, never from a recompute of the current seed order.
// No I/O, no mutation, deterministic — component + tests share this exact logic.

// ── Inputs (minimal shapes, mapped from the admin workspace/setup in the component) ──────────────

// One persisted seed slot's qualification token, with the competitor currently resolved into it.
export interface ReadonlyTokenInput {
  readonly tokenId: string
  readonly competitorId: string | null
}

// A branch's persisted seed order (slot order) + its tokens. Null when the branch has no saved seeds.
export interface ReadonlySeedInput {
  readonly seededIds: readonly string[]
  readonly tokens: readonly ReadonlyTokenInput[]
}

// One OFFICIAL first-round match, as stored (frozen at generation). `status === 'bye'` marks the
// automatic first-round advance; a missing competitor id on a non-bye match is a not-yet-known slot.
export interface ReadonlyMatchInput {
  readonly matchNumber: number
  readonly competitorAId: string | null
  readonly competitorBId: string | null
  readonly status: string
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────

export interface ReadonlySeedRow {
  readonly seed: number // 1-based position in the seed order
  readonly tokenId: string
  readonly competitorId: string | null // resolved competitor for the token (null when unresolved)
}

export type ReadonlyPairingSlot =
  | { readonly kind: 'competitor'; readonly competitorId: string }
  | { readonly kind: 'bye' }
  | { readonly kind: 'tbd' }

export interface ReadonlyPairing {
  readonly matchNumber: number
  readonly slotA: ReadonlyPairingSlot
  readonly slotB: ReadonlyPairingSlot
  readonly isBye: boolean
}

export interface ReadonlyBranchView {
  readonly seedRows: readonly ReadonlySeedRow[]
  readonly pairings: readonly ReadonlyPairing[]
  readonly bracketSize: number // total first-round slots (bracket capacity)
  readonly competitorCount: number // real competitors actually placed in the first round
  readonly byes: number // first-round automatic advances
  readonly hasData: boolean // any official first-round match to show
}

function slotOf(competitorId: string | null, isBye: boolean): ReadonlyPairingSlot {
  if (competitorId) return { kind: 'competitor', competitorId }
  return isBye ? { kind: 'bye' } : { kind: 'tbd' }
}

/**
 * Build the read-only branch view from the persisted seed order + the OFFICIAL first-round matches.
 * Stats (capacity / real-competitor count / byes) are derived from the stored matches — the bracket as
 * played — never re-derived from the current seed configuration.
 */
export function buildReadonlyBranchView(input: {
  seed: ReadonlySeedInput | null
  firstRoundMatches: readonly ReadonlyMatchInput[]
}): ReadonlyBranchView {
  const { seed } = input
  // Stable, deterministic order: sort by match number (rows may arrive in any order).
  const matches = [...input.firstRoundMatches].sort((a, b) => a.matchNumber - b.matchNumber)

  const competitorById = new Map<string, string | null>()
  if (seed) for (const tk of seed.tokens) competitorById.set(tk.tokenId, tk.competitorId)

  const seedRows: ReadonlySeedRow[] = seed
    ? seed.seededIds.map((tokenId, i) => ({
        seed: i + 1,
        tokenId,
        competitorId: competitorById.get(tokenId) ?? null,
      }))
    : []

  const pairings: ReadonlyPairing[] = matches.map((m) => {
    const isBye = m.status === 'bye'
    return {
      matchNumber: m.matchNumber,
      slotA: slotOf(m.competitorAId, isBye),
      slotB: slotOf(m.competitorBId, isBye),
      isBye,
    }
  })

  let competitorCount = 0
  let byes = 0
  for (const m of matches) {
    if (m.competitorAId) competitorCount += 1
    if (m.competitorBId) competitorCount += 1
    if (m.status === 'bye') byes += 1
  }

  return {
    seedRows,
    pairings,
    bracketSize: matches.length * 2,
    competitorCount,
    byes,
    hasData: matches.length > 0,
  }
}

// ── Reset gate ─────────────────────────────────────────────────────────────────────────────────

// Why a generated bracket may not be reset (mirrors the server's authoritative checks — the UI only
// pre-empts them so the reason is visible, never a silently disabled button). 'has_results' wins over
// 'forbidden' so a viewer who also lacks the permission still learns the primary blocker.
export type BracketResetGate =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'has_results' | 'forbidden' }

/**
 * Decide whether the "Đặt lại nhánh đấu" control is offered. The server RE-CHECKS DB truth on the
 * actual reset (a spoofed `hasResults=false` cannot bypass it); this only shapes the read-only UI.
 */
export function evaluateBracketResetGate(input: {
  hasResults: boolean
  canManage: boolean
}): BracketResetGate {
  if (input.hasResults) return { allowed: false, reason: 'has_results' }
  if (!input.canManage) return { allowed: false, reason: 'forbidden' }
  return { allowed: true }
}
