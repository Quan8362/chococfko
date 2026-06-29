// ─────────────────────────────────────────────────────────────────────────────
// Human-readable decision explanations (development / replay only).
//
// Turns a scored decision + its rejected alternatives into the "Selected … Reasons
// … Alternative … Rejected because …" form from the spec. Pure; uses only public
// info already in the scored breakdown. Never enabled in production by default.
// ─────────────────────────────────────────────────────────────────────────────
import { toCode } from '../engine.ts'
import { type Decision, type ScoredDecision } from './types.ts'

function describe(d: Decision): string {
  if (d.kind === 'pass') return 'Pass'
  const m = d.move
  const cards = m.cards.map(toCode).join(' ')
  const label = m.combinationType === 'pairsRun' ? 'consecutive pairs'
    : m.combinationType === 'four' ? 'four of a kind'
    : m.combinationType
  return `${label[0].toUpperCase()}${label.slice(1)} [${cards}]`
}

const FRIENDLY: Record<string, string> = {
  immediateWin: 'wins the round immediately',
  forcedWin: 'sets up a near-forced win',
  blockOneCardOpponent: 'denies a one-card opponent',
  blockTwoCardOpponent: 'pressures a two-card opponent',
  preventImmediateLoss: 'reduces immediate-loss risk',
  unsafeSingleLead: 'avoids an unsafe single lead',
  maintainControl: 'keeps control of the table',
  regainControl: 'regains control of the table',
  seatOrderDanger: 'accounts for the next player',
  opponentMatchProbability: 'is hard for opponents to answer',
  cardsRemoved: 'sheds more cards',
  removeWeakSingles: 'clears a weak low single',
  reduceTurnsToFinish: 'shapes the hand toward fewer turns',
  breakPair: 'splits a pair', breakTriple: 'splits a triple',
  breakStraight: 'splits a straight', breakBomb: 'splits a bomb',
  breakCombination: 'fragments a combination',
  futureFlexibility: 'keeps flexible future options',
  highCardCost: 'spends high cards', wasteTwo: 'spends a 2 (heo)',
  preserveBomb: 'spends a bomb', conservePremiums: 'conserves premium cards',
  conserveOptions: 'keeps options open', cedeTrickRisk: 'cedes the trick',
}

export interface DecisionExplanation {
  selected: string
  pros: string[]
  cons: string[]
  alternative: string | null
  alternativeReason: string | null
  text: string
}

export function explainDecision(chosen: ScoredDecision, all: ScoredDecision[]): DecisionExplanation {
  const sorted = all.slice().sort((a, b) => b.score - a.score)
  const terms = (chosen.breakdown ?? []).slice().sort((a, b) => b.contribution - a.contribution)
  const pros = terms.filter(t => t.contribution > 0).slice(0, 4).map(t => `+ ${FRIENDLY[t.term] ?? t.term} (${t.contribution.toFixed(0)})`)
  const cons = terms.filter(t => t.contribution < 0).slice(0, 3).map(t => `- ${FRIENDLY[t.term] ?? t.term} (${t.contribution.toFixed(0)})`)

  const altScored = sorted.find(s => describe(s.decision) !== describe(chosen.decision)) ?? null
  const alternative = altScored ? describe(altScored.decision) : null
  // Why rejected: the term where the alternative is most worse than the chosen.
  let alternativeReason: string | null = null
  if (altScored) {
    const gap = chosen.score - altScored.score
    const worstTerm = (altScored.breakdown ?? []).slice().sort((a, b) => a.contribution - b.contribution)[0]
    alternativeReason = worstTerm
      ? `lower overall value (${gap.toFixed(0)}); notably ${FRIENDLY[worstTerm.term] ?? worstTerm.term}`
      : `lower overall value (${gap.toFixed(0)})`
  }

  const text = [
    `Selected: ${describe(chosen.decision)} (score ${chosen.score.toFixed(0)})`,
    '',
    'Reasons:',
    ...pros,
    ...cons,
    ...(alternative ? ['', `Alternative: ${alternative}`, `Rejected because ${alternativeReason}.`] : []),
  ].join('\n')

  return { selected: describe(chosen.decision), pros, cons, alternative, alternativeReason, text }
}
