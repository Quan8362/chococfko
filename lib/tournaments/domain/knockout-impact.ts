// Knockout dependency-graph reconstruction & correction impact analysis (Prompt 11).
//
// When an admin corrects the SCORE of an upstream knockout match whose downstream matches are ALREADY
// completed, we must never silently cascade. Instead the server reconstructs the dependency graph from
// DB truth and computes the EXACT set of downstream matches that depend on the corrected match, so the
// admin can be shown a precise impact preview and (on explicit RESET confirmation) only that dependency
// path is reset — never an independent branch, never the group stage, never the other bracket.
//
// Pure & deterministic; never mutates input; no DB or I/O. The action layer loads the ground-truth match
// records and calls this; the RPC re-verifies version + applies the plan atomically. The client is NEVER
// trusted for the impact list — it only supplies the confirmation text, the new games and a version token.
//
// Reuses the SAME source-match / source-outcome shape persisted by the bracket (see knockout-seed.ts):
// a downstream slot references its producer match by `sourceMatch{A,B}Id` with `sourceOutcome{A,B}` in
// {winner, loser}. A semifinal therefore feeds BOTH the final (winner) and the third-place match (loser);
// both are downstream and both are in the dependency path when that semifinal's result changes.

export interface ImpactMatchRecord {
  readonly id: string
  readonly generationKey: string
  readonly bracket: string // 'championship' | 'consolation'
  readonly roundNumber: number
  readonly matchNumber: number
  readonly status: string // pending | ready | completed | bye | cancelled
  readonly competitorAId: string | null
  readonly competitorBId: string | null
  readonly winnerId: string | null
  readonly sourceMatchAId: string | null
  readonly sourceMatchBId: string | null
  readonly sourceOutcomeA: string | null // winner | loser | null
  readonly sourceOutcomeB: string | null
  readonly gameCount: number
}

export interface AnalyzeCorrectionInput {
  readonly matches: readonly ImpactMatchRecord[] // ALL knockout matches of the event (both brackets)
  readonly upstreamMatchId: string
  readonly newWinnerId: string // derived by the action from the corrected scores (never the client)
}

// One downstream match that will be reset, and exactly which of its slots lose their participant.
export interface AffectedMatch {
  readonly matchId: string
  readonly matchKey: string
  readonly bracket: string
  readonly roundNumber: number
  readonly matchNumber: number
  readonly status: string
  readonly willClearResult: boolean // it currently has a result (completed)
  readonly gamesToDelete: number
  // Competitor ids currently sitting in slots that will be emptied (fed from the corrected path).
  readonly participantsToReset: readonly string[]
  // The concrete slot references that must be nulled (fed from the corrected path).
  readonly clearSlots: readonly { readonly matchId: string; readonly slot: 'A' | 'B' }[]
}

export type CorrectionImpactError =
  | { readonly code: 'unknown_match' }
  | { readonly code: 'not_completed' } // upstream match has no result to correct
  | { readonly code: 'not_a_pairing' } // upstream is a BYE / placeholder — not correctable this way
  | { readonly code: 'winner_not_in_match' } // newWinnerId is not one of the two competitors

export interface CorrectionImpact {
  readonly upstreamMatchId: string
  readonly upstreamMatchKey: string
  readonly bracket: string
  readonly roundNumber: number
  readonly matchNumber: number
  readonly currentWinnerId: string
  readonly currentLoserId: string
  readonly newWinnerId: string
  readonly newLoserId: string
  readonly winnerChanges: boolean
  readonly affected: readonly AffectedMatch[] // ordered by round asc, then match asc
  readonly totalGamesToDelete: number
  readonly resultsToClear: number // affected matches that are currently completed
  readonly podiumWillClear: boolean
  readonly branchesAffected: readonly string[] // exactly the corrected bracket
  readonly branchesUnaffected: readonly string[] // every other bracket present, left untouched
  // The immediate progression the RESET re-applies from the NEW winner/loser (one level).
  readonly reprogress: readonly { readonly matchId: string; readonly slot: 'A' | 'B'; readonly competitorId: string }[]
}

export type CorrectionImpactResult =
  | { readonly ok: true; readonly impact: CorrectionImpact }
  | { readonly ok: false; readonly error: CorrectionImpactError }

/**
 * Reconstruct the dependency graph from persisted match records and compute the precise impact of
 * correcting `upstreamMatchId` so its winner becomes `newWinnerId`. Only matches in the SAME bracket
 * that transitively depend on the corrected match are affected; every other match (independent matches
 * in the same round, the other branch, the group stage) is left out.
 */
export function analyzeKnockoutCorrection(input: AnalyzeCorrectionInput): CorrectionImpactResult {
  const { matches, upstreamMatchId, newWinnerId } = input
  const byId = new Map(matches.map((m) => [m.id, m]))
  const upstream = byId.get(upstreamMatchId)
  if (!upstream) return { ok: false, error: { code: 'unknown_match' } }

  if (upstream.competitorAId === null || upstream.competitorBId === null) {
    return { ok: false, error: { code: 'not_a_pairing' } }
  }
  if (upstream.status !== 'completed' || upstream.winnerId === null) {
    return { ok: false, error: { code: 'not_completed' } }
  }
  if (newWinnerId !== upstream.competitorAId && newWinnerId !== upstream.competitorBId) {
    return { ok: false, error: { code: 'winner_not_in_match' } }
  }

  const currentWinnerId = upstream.winnerId
  const currentLoserId = currentWinnerId === upstream.competitorAId ? upstream.competitorBId : upstream.competitorAId
  const newLoserId = newWinnerId === upstream.competitorAId ? upstream.competitorBId : upstream.competitorAId
  const winnerChanges = currentWinnerId !== newWinnerId

  // Restrict the graph to the corrected match's bracket — branches never exchange competitors.
  const bracket = upstream.bracket
  const inBranch = matches.filter((m) => m.bracket === bracket)

  // Reverse adjacency: producerMatchId → the downstream slots it feeds.
  interface Edge {
    readonly matchId: string
    readonly slot: 'A' | 'B'
    readonly outcome: 'winner' | 'loser'
  }
  const consumers = new Map<string, Edge[]>()
  const addEdge = (producerId: string | null, edge: Edge) => {
    if (!producerId) return
    const list = consumers.get(producerId)
    if (list) list.push(edge)
    else consumers.set(producerId, [edge])
  }
  for (const m of inBranch) {
    if (m.sourceOutcomeA === 'winner' || m.sourceOutcomeA === 'loser') {
      addEdge(m.sourceMatchAId, { matchId: m.id, slot: 'A', outcome: m.sourceOutcomeA })
    }
    if (m.sourceOutcomeB === 'winner' || m.sourceOutcomeB === 'loser') {
      addEdge(m.sourceMatchBId, { matchId: m.id, slot: 'B', outcome: m.sourceOutcomeB })
    }
  }

  // Transitive downstream closure of the corrected match (breadth-first). `affectedIds` excludes the
  // upstream itself. `clearSlotsByMatch` records which slots of each affected match are fed from the
  // corrected path (and so must be emptied); slots fed by an INDEPENDENT match are kept.
  const affectedIds = new Set<string>()
  const clearSlotsByMatch = new Map<string, Set<'A' | 'B'>>()
  const producers = new Set<string>([upstreamMatchId])
  const queue: string[] = [upstreamMatchId]
  while (queue.length > 0) {
    const producerId = queue.shift()!
    for (const edge of consumers.get(producerId) ?? []) {
      const slots = clearSlotsByMatch.get(edge.matchId) ?? new Set<'A' | 'B'>()
      slots.add(edge.slot)
      clearSlotsByMatch.set(edge.matchId, slots)
      if (!affectedIds.has(edge.matchId)) {
        affectedIds.add(edge.matchId)
        if (!producers.has(edge.matchId)) {
          producers.add(edge.matchId)
          queue.push(edge.matchId)
        }
      }
    }
  }

  const affected: AffectedMatch[] = Array.from(affectedIds)
    .map((id) => byId.get(id)!)
    .filter((m): m is ImpactMatchRecord => !!m)
    .sort((a, b) => (a.roundNumber - b.roundNumber) || (a.matchNumber - b.matchNumber))
    .map((m) => {
      const slots = clearSlotsByMatch.get(m.id) ?? new Set<'A' | 'B'>()
      const participants: string[] = []
      const clear: { matchId: string; slot: 'A' | 'B' }[] = []
      for (const slot of ['A', 'B'] as const) {
        if (!slots.has(slot)) continue
        clear.push({ matchId: m.id, slot })
        const comp = slot === 'A' ? m.competitorAId : m.competitorBId
        if (comp) participants.push(comp)
      }
      return {
        matchId: m.id,
        matchKey: m.generationKey,
        bracket: m.bracket,
        roundNumber: m.roundNumber,
        matchNumber: m.matchNumber,
        status: m.status,
        willClearResult: m.status === 'completed',
        gamesToDelete: m.gameCount,
        participantsToReset: participants,
        clearSlots: clear,
      }
    })

  // Re-progression the RESET re-applies from the NEW winner/loser — exactly the immediate consumers of
  // the corrected match (one level); deeper matches stay pending until their parents are replayed.
  const reprogress: { matchId: string; slot: 'A' | 'B'; competitorId: string }[] = []
  for (const edge of consumers.get(upstreamMatchId) ?? []) {
    reprogress.push({
      matchId: edge.matchId,
      slot: edge.slot,
      competitorId: edge.outcome === 'winner' ? newWinnerId : newLoserId,
    })
  }

  const resultsToClear = affected.filter((a) => a.willClearResult).length
  const totalGamesToDelete = affected.reduce((sum, a) => sum + a.gamesToDelete, 0)
  // Any completed downstream in this branch means the branch was (or was heading toward) complete, so
  // this branch's podium is invalidated. Independent branches keep theirs.
  const podiumWillClear = resultsToClear > 0
  const branchesPresent = Array.from(new Set(matches.map((m) => m.bracket))).sort()
  const branchesUnaffected = branchesPresent.filter((b) => b !== bracket)

  return {
    ok: true,
    impact: {
      upstreamMatchId,
      upstreamMatchKey: upstream.generationKey,
      bracket,
      roundNumber: upstream.roundNumber,
      matchNumber: upstream.matchNumber,
      currentWinnerId,
      currentLoserId,
      newWinnerId,
      newLoserId,
      winnerChanges,
      affected,
      totalGamesToDelete,
      resultsToClear,
      podiumWillClear,
      branchesAffected: [bracket],
      branchesUnaffected,
      reprogress,
    },
  }
}
