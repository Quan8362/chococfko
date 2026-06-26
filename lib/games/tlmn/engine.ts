// ─────────────────────────────────────────────────────────────────────────────
// Tiến Lên Miền Nam — pure rules engine ("chuẩn chỉ", FULL ruleset).
//
// Framework-agnostic: NO React, NO Supabase, NO next/* imports. Everything here is
// a pure function so it can be unit-tested in isolation and reused by bots (Phase 5)
// and the realtime server actions (Phase 3). All tunable amounts live in DEFAULT_RULES;
// host overrides are deep-merged via resolveRules().
// ─────────────────────────────────────────────────────────────────────────────

// ── Cards & ordering ────────────────────────────────────────────────────────────
// Rank low→high: 3 4 5 6 7 8 9 10 J Q K A 2   (2 = "heo", the highest single)
// Suit low→high: ♠ bích < ♣ chuồn < ♦ rô < ♥ cơ
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const
export const SUITS = ['S', 'C', 'D', 'H'] as const // bích, chuồn, rô, cơ

export const R2 = 12  // rank index of "2" (heo) — the highest rank, never in a straight/run
export const R3 = 0   // rank index of "3" — lowest rank
export const SUIT_SPADE = 0 // ♠ — the 3♠ is the mandatory round-1 opener

export type RankIndex = number // 0..12 (index into RANKS)
export type SuitIndex = number // 0..3  (index into SUITS)

export type Card = { rank: RankIndex; suit: SuitIndex }

/** Absolute strength of a single card: rank dominates, suit breaks ties. 3♠=0 … 2♥=51. */
export function strength(c: Card): number {
  return c.rank * 4 + c.suit
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}

// ── Parsing / formatting (string codes are convenient for tests & logs) ─────────
// A code is "<rank><suit>", e.g. "3S", "10H", "AH", "2S". "T" is accepted for "10".
export function parseCard(code: string): Card {
  const suit = SUITS.indexOf(code.slice(-1).toUpperCase() as (typeof SUITS)[number])
  let rankStr = code.slice(0, -1).toUpperCase()
  if (rankStr === 'T') rankStr = '10'
  const rank = RANKS.indexOf(rankStr as (typeof RANKS)[number])
  if (rank < 0 || suit < 0) throw new Error(`Invalid card code: "${code}"`)
  return { rank, suit }
}

/** Parse a whitespace-separated hand string, e.g. "3S 4S 5S 2H". */
export function parseHand(s: string): Card[] {
  return s.trim().split(/\s+/).filter(Boolean).map(parseCard)
}

export function toCode(c: Card): string {
  return RANKS[c.rank] + SUITS[c.suit]
}

// ── Deck helpers (pure; used by the dealer in Phase 3) ──────────────────────────
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (let r = 0; r < RANKS.length; r++)
    for (let s = 0; s < SUITS.length; s++)
      deck.push({ rank: r, suit: s })
  return deck
}

/** Fisher–Yates shuffle using an injected RNG (default Math.random) — pure given rng. */
export function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Sort ascending by strength (lowest first). Non-mutating. */
export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => strength(a) - strength(b))
}

// ── Combinations ────────────────────────────────────────────────────────────────
export type ComboType =
  | 'single'   // 1 card
  | 'pair'     // 2 same rank
  | 'triple'   // 3 same rank (sám cô)
  | 'straight' // ≥3 consecutive ranks (sảnh) — no 2, no wrap
  | 'four'     // 4 same rank (tứ quý) — bomb
  | 'pairsRun' // N consecutive pairs (đôi thông) — no 2; 3+ pairs are bombs

export type Combo = {
  type: ComboType
  cards: Card[]
  count: number       // number of cards
  high: Card          // strongest card — the basis for same-shape comparison
}

// ── DEFAULT_RULES — documented, tunable config ──────────────────────────────────
export type BombsConfig = {
  // What a "3 đôi thông" (3 consecutive pairs) may cut, beyond a lower 3 đôi thông.
  threePairsRunCutsSingle2: boolean
  // What a "tứ quý" may cut, beyond a lower tứ quý.
  fourCutsSingle2: boolean
  fourCutsThreePairsRun: boolean
  // What a "4 đôi thông" (4 consecutive pairs) may cut, beyond a lower 4 đôi thông.
  fourPairsRunCutsPairOf2s: boolean
  fourPairsRunCutsFour: boolean
  fourPairsRunCutsThreePairsRun: boolean
}

export type InstantWinType =
  | 'dongHoa'      // all 13 cards same suit
  | 'tuQuyHeo'     // all four 2s
  | 'sanhRong'     // dragon straight 3..A present
  | 'namDoiThong'  // 5 consecutive pairs
  | 'sauDoi'       // ≥6 pairs
  | 'baSamCo'      // 3 triples

export type Rules = {
  // ── on/off flags (all ON in DEFAULT_RULES ⇒ full ruleset) ──────────────────
  toiTrangEnabled: boolean     // instant win on deal (tới trắng)
  thoiHeoEnabled: boolean      // doubling for a loser still holding a 2 (thối heo)
  thoiBomEnabled: boolean      // flat penalty for a held bomb bộ (thối đôi thông / tứ quý)
  congEnabled: boolean         // multiplier when a loser played 0 cards (cóng)
  denEnabled: boolean          // đền khi bị chặt (victim→cutter transfers)
  // ── numeric amounts ────────────────────────────────────────────────────────
  basePerCard: number          // pay per remaining card to the Nhất
  thoiHeoMultiplier: number    // multiply a loser's card-payment if they still hold a 2
  thoiHeoPerCard: boolean      // if true, multiply once per held 2 instead of a single doubling
  thoiBomPenalty: number       // flat penalty per held tứ quý / đôi-thông bộ
  congMultiplier: number       // multiply the 13-card payment when a loser played 0 cards
  denHeo: number               // victim→cutter when a held 2 (heo) is cut
  denBom: number               // victim→cutter when a held bomb is cut by a bigger bomb
  toiTrangPayout: number       // each other player pays the instant-winner this
  turnSeconds: number          // per-turn clock (used by the realtime layer, not here)
  // ── engine-level (NOT host-editable in v1) ─────────────────────────────────
  endOnFirstOut: boolean       // đếm-lá: round ends the instant the FIRST player is out
  nextRoundLeader: 'winner' | 'loser' // who leads next round
  instantWinOrder: InstantWinType[]   // highest → lowest when several match
  bombs: BombsConfig
}

/** @deprecated use `Rules` */
export type RulesConfig = Rules

// The canonical, full "chuẩn chỉ" ruleset — everything ON. Host overrides are
// deep-merged onto this via resolveRules(); an untouched config ⇒ the full ruleset.
export const DEFAULT_RULES: Rules = {
  toiTrangEnabled: true,
  thoiHeoEnabled: true,
  thoiBomEnabled: true,
  congEnabled: true,
  denEnabled: true,
  basePerCard: 1,
  thoiHeoMultiplier: 2,
  thoiHeoPerCard: false,
  thoiBomPenalty: 5,
  congMultiplier: 2,
  denHeo: 5,
  denBom: 10,
  toiTrangPayout: 20,
  turnSeconds: 20,
  endOnFirstOut: true,
  nextRoundLeader: 'winner',
  // High → low. dongHoa beats everything; baSamCo is the weakest.
  instantWinOrder: ['dongHoa', 'tuQuyHeo', 'sanhRong', 'namDoiThong', 'sauDoi', 'baSamCo'],
  bombs: {
    threePairsRunCutsSingle2: true,
    fourCutsSingle2: true,
    fourCutsThreePairsRun: true,
    fourPairsRunCutsPairOf2s: true,
    fourPairsRunCutsFour: true,
    fourPairsRunCutsThreePairsRun: true,
  },
}

function cloneRules(r: Rules): Rules {
  return { ...r, instantWinOrder: [...r.instantWinOrder], bombs: { ...r.bombs } }
}

/**
 * Deep-merge a partial host override onto DEFAULT_RULES → a complete Rules.
 * Only KNOWN keys are copied (unknown keys are ignored), so resolveRules({}) and
 * resolveRules(undefined) both deep-equal DEFAULT_RULES (untouched ⇒ full ruleset).
 */
export function resolveRules(partial?: Partial<Rules>): Rules {
  const out = cloneRules(DEFAULT_RULES)
  if (!partial) return out

  for (const key of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) {
    if (key === 'bombs') continue
    const v = (partial as Record<string, unknown>)[key]
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  if (partial.bombs && typeof partial.bombs === 'object') {
    for (const bk of Object.keys(DEFAULT_RULES.bombs) as (keyof BombsConfig)[]) {
      const bv = (partial.bombs as Record<string, unknown>)[bk]
      if (bv !== undefined) (out.bombs as Record<string, unknown>)[bk] = bv
    }
  }
  return out
}

// ── Host-configurable allow-list (for the Phase-3 lobby settings UI) ─────────────
// Only these keys may be overridden by a room host in v1. bombs / instantWinOrder /
// endOnFirstOut / nextRoundLeader stay engine-level.
export const HOST_CONFIGURABLE_KEYS = [
  'toiTrangEnabled', 'thoiHeoEnabled', 'thoiBomEnabled', 'congEnabled', 'denEnabled',
  'basePerCard', 'thoiHeoMultiplier', 'thoiBomPenalty', 'congMultiplier',
  'denHeo', 'denBom', 'toiTrangPayout', 'turnSeconds',
] as const
export type HostConfigurableKey = (typeof HOST_CONFIGURABLE_KEYS)[number]
export type HostRulesOverride = Partial<Pick<Rules, HostConfigurableKey>>

/** Strip any non-allow-listed keys from a raw host override before persisting. */
export function pickHostOverride(raw: Partial<Rules> & Record<string, unknown>): HostRulesOverride {
  const out: Record<string, unknown> = {}
  for (const k of HOST_CONFIGURABLE_KEYS) {
    if (raw[k] !== undefined) out[k] = raw[k]
  }
  return out as HostRulesOverride
}

// ── Internal grouping helpers ───────────────────────────────────────────────────
function rankCounts(cards: Card[]): Map<RankIndex, Card[]> {
  const m = new Map<RankIndex, Card[]>()
  for (const c of cards) {
    const arr = m.get(c.rank) ?? []
    arr.push(c)
    m.set(c.rank, arr)
  }
  // suit-ascending within each rank for deterministic representative picks
  m.forEach(arr => arr.sort((a, b) => a.suit - b.suit))
  return m
}

function highest(cards: Card[]): Card {
  return cards.reduce((hi, c) => (strength(c) > strength(hi) ? c : hi))
}

/** Sorted unique rank indices form a gap-free ascending run that excludes "2". */
function isConsecutiveNoTwo(sortedRanks: RankIndex[]): boolean {
  if (sortedRanks.length === 0) return false
  for (let i = 0; i < sortedRanks.length; i++) {
    if (sortedRanks[i] === R2) return false               // 2 never in a straight/run
    if (i > 0 && sortedRanks[i] !== sortedRanks[i - 1] + 1) return false // gap / no wrap
  }
  return true
}

// ── parseCombo ──────────────────────────────────────────────────────────────────
/** Identify the single legal combo a card set forms, or null if it forms none. */
export function parseCombo(cards: Card[]): Combo | null {
  if (!cards || cards.length === 0) return null
  // Reject exact-duplicate cards (same rank+suit) — an illegal multiset.
  const seen = new Set<string>()
  for (const c of cards) {
    const k = `${c.rank}-${c.suit}`
    if (seen.has(k)) return null
    seen.add(k)
  }

  const counts = rankCounts(cards)
  const ranks = Array.from(counts.keys()).sort((a, b) => a - b)

  // All one rank → single / pair / triple / four.
  if (ranks.length === 1) {
    const n = cards.length
    if (n === 1) return { type: 'single', cards, count: 1, high: cards[0] }
    if (n === 2) return { type: 'pair', cards, count: 2, high: highest(cards) }
    if (n === 3) return { type: 'triple', cards, count: 3, high: highest(cards) }
    if (n === 4) return { type: 'four', cards, count: 4, high: highest(cards) }
    return null
  }

  // Straight: every rank appears once, ≥3 cards, consecutive, no 2.
  if (cards.length >= 3 && ranks.every(r => counts.get(r)!.length === 1) && isConsecutiveNoTwo(ranks)) {
    return { type: 'straight', cards, count: cards.length, high: highest(cards) }
  }

  // Pairs-run (đôi thông): every rank appears exactly twice, ≥3 ranks, consecutive, no 2.
  if (
    cards.length >= 6 && cards.length % 2 === 0 &&
    ranks.length >= 3 &&
    ranks.every(r => counts.get(r)!.length === 2) &&
    isConsecutiveNoTwo(ranks)
  ) {
    return { type: 'pairsRun', cards, count: cards.length, high: highest(cards) }
  }

  return null
}

// ── Bomb classification ──────────────────────────────────────────────────────────
function isThreePairsRun(c: Combo): boolean { return c.type === 'pairsRun' && c.count === 6 }
function isFourPairsRun(c: Combo): boolean { return c.type === 'pairsRun' && c.count === 8 }
function isFour(c: Combo): boolean { return c.type === 'four' }
function isSingleTwo(c: Combo): boolean { return c.type === 'single' && c.high.rank === R2 }
function isPairOfTwos(c: Combo): boolean { return c.type === 'pair' && c.high.rank === R2 }

/** Is `c` any kind of bomb/chặt? */
export function isBomb(c: Combo): boolean {
  return isFour(c) || isThreePairsRun(c) || isFourPairsRun(c)
}

// Cross-type cutting (the candidate is a bomb cutting a different-shaped table play).
function canCut(candidate: Combo, table: Combo, rules: Rules): boolean {
  const b = rules.bombs
  if (isThreePairsRun(candidate)) {
    return b.threePairsRunCutsSingle2 && isSingleTwo(table)
  }
  if (isFour(candidate)) {
    if (b.fourCutsSingle2 && isSingleTwo(table)) return true
    if (b.fourCutsThreePairsRun && isThreePairsRun(table)) return true
    return false
  }
  if (isFourPairsRun(candidate)) {
    if (b.fourPairsRunCutsPairOf2s && isPairOfTwos(table)) return true
    if (b.fourPairsRunCutsFour && isFour(table)) return true
    if (b.fourPairsRunCutsThreePairsRun && isThreePairsRun(table)) return true
    return false
  }
  return false
}

// ── beats ────────────────────────────────────────────────────────────────────────
/**
 * Can `candidate` legally be played on top of `table`?
 *  • table === null  ⇒ leading: any legal combo is allowed.
 *  • same type + same count ⇒ must be strictly higher by highest card.
 *  • otherwise ⇒ only via a bomb cut (canCut).
 */
export function beats(candidate: Combo | null, table: Combo | null, rules: Rules = DEFAULT_RULES): boolean {
  if (!candidate) return false
  if (!table) return true // leading — candidate is already a validated Combo

  // Same shape → strict higher-by-highest-card.
  if (candidate.type === table.type && candidate.count === table.count) {
    return strength(candidate.high) > strength(table.high)
  }
  return canCut(candidate, table, rules)
}

// ── legalMoves ────────────────────────────────────────────────────────────────────
// Generate a representative set of legal combos in `hand` that beat `table`
// (every legal combo when leading). Singles/pairs/triples/fours are enumerated
// exhaustively; straights & pairs-runs use one strongest-top representative per
// (start, length) — sufficient for move-existence checks, bots and UI hints.
export function enumerateCombos(hand: Card[]): Combo[] {
  const out: Combo[] = []
  const counts = rankCounts(hand)
  const ranks = Array.from(counts.keys()).sort((a, b) => a - b)

  const combos = <T,>(arr: T[], k: number): T[][] => {
    const res: T[][] = []
    const rec = (start: number, pick: T[]) => {
      if (pick.length === k) { res.push(pick.slice()); return }
      for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop() }
    }
    rec(0, [])
    return res
  }

  // singles / pairs / triples / fours
  for (const r of ranks) {
    const group = counts.get(r)!
    for (const c of group) out.push({ type: 'single', cards: [c], count: 1, high: c })
    if (group.length >= 2) for (const pr of combos(group, 2)) out.push({ type: 'pair', cards: pr, count: 2, high: highest(pr) })
    if (group.length >= 3) for (const tr of combos(group, 3)) out.push({ type: 'triple', cards: tr, count: 3, high: highest(tr) })
    if (group.length === 4) out.push({ type: 'four', cards: group.slice(), count: 4, high: highest(group) })
  }

  // straights: for each (start, length≥3) where each rank in range exists & rank<R2
  const hasRank = (r: RankIndex) => counts.has(r) && counts.get(r)!.length >= 1
  for (let start = 0; start < R2; start++) {
    for (let len = 3; start + len <= R2; len++) {
      let ok = true
      for (let r = start; r < start + len; r++) if (!hasRank(r)) { ok = false; break }
      if (!ok) break // longer runs from this start will also fail at this gap
      const cards: Card[] = []
      for (let r = start; r < start + len; r++) {
        const group = counts.get(r)!
        cards.push(r === start + len - 1 ? group[group.length - 1] : group[0]) // strongest top card
      }
      out.push({ type: 'straight', cards, count: cards.length, high: highest(cards) })
    }
  }

  // pairs-runs: for each (start, pairs≥3) where each rank in range has ≥2 & rank<R2
  const hasPair = (r: RankIndex) => counts.has(r) && counts.get(r)!.length >= 2
  for (let start = 0; start < R2; start++) {
    for (let pairs = 3; start + pairs <= R2; pairs++) {
      let ok = true
      for (let r = start; r < start + pairs; r++) if (!hasPair(r)) { ok = false; break }
      if (!ok) break
      const cards: Card[] = []
      for (let r = start; r < start + pairs; r++) {
        const group = counts.get(r)!
        if (r === start + pairs - 1) cards.push(group[group.length - 2], group[group.length - 1]) // strongest top pair
        else cards.push(group[0], group[1])
      }
      out.push({ type: 'pairsRun', cards, count: cards.length, high: highest(cards) })
    }
  }

  return out
}

export function legalMoves(hand: Card[], table: Combo | null, rules: Rules = DEFAULT_RULES): Combo[] {
  return enumerateCombos(hand).filter(c => beats(c, table, rules))
}

// ── Round-1 opening: the first play of round 1 must contain 3♠ ───────────────────
export function isRoundOneOpening(combo: Combo | null): boolean {
  if (!combo) return false
  return combo.cards.some(c => c.rank === R3 && c.suit === SUIT_SPADE)
}

// ── Tới trắng — instant win on the freshly-dealt 13-card hand ─────────────────────
export type InstantWin = { type: InstantWinType }

function countByRank(cards: Card[]): number[] {
  const n = new Array(RANKS.length).fill(0)
  for (const c of cards) n[c.rank]++
  return n
}

function hasNConsecutivePairs(counts: number[], n: number): boolean {
  let run = 0
  for (let r = 0; r < R2; r++) { // exclude 2
    run = counts[r] >= 2 ? run + 1 : 0
    if (run >= n) return true
  }
  return false
}

function detectInstantWin(hand: Card[], type: InstantWinType): boolean {
  const counts = countByRank(hand)
  switch (type) {
    case 'dongHoa':
      return hand.length > 0 && hand.every(c => c.suit === hand[0].suit)
    case 'tuQuyHeo':
      return counts[R2] === 4
    case 'sanhRong': // at least one of every rank 3..A (indices 0..11)
      for (let r = R3; r < R2; r++) if (counts[r] < 1) return false
      return true
    case 'namDoiThong':
      return hasNConsecutivePairs(counts, 5)
    case 'sauDoi':
      return counts.filter(c => c >= 2).length >= 6
    case 'baSamCo':
      return counts.filter(c => c >= 3).length >= 3
  }
}

/**
 * Highest-ranked instant win on a dealt hand (per rules.instantWinOrder), else null.
 * Accepts a resolved Rules or a partial override (resolved internally). Returns null
 * unconditionally when toiTrangEnabled is off.
 */
export function checkInstantWin(hand: Card[], rules: Partial<Rules> = DEFAULT_RULES): InstantWin | null {
  const R = resolveRules(rules)
  if (!R.toiTrangEnabled) return null
  for (const type of R.instantWinOrder) {
    if (detectInstantWin(hand, type)) return { type }
  }
  return null
}

// ── Round end & settlement — đếm lá / thối / cóng / đền ───────────────────────────
export type CutKind = 'heo' | 'bom'
export type CutEvent = { cutVictim: number; cutter: number; kind: CutKind }

export type SettlementState = {
  seats: number[]                          // active seat indices in the round
  winner: number                           // the Nhất (first player out)
  hands: Record<number, Card[]>            // cards still held; winner holds []
  playedCount: Record<number, number>      // cards each seat played (0 ⇒ cóng)
  cutEvents?: CutEvent[]                    // chặt events recorded during play
  instantWin?: { seat: number; type: InstantWinType } | null
}

/** Count held "thối-bom" units: complete tứ quý + each maximal run of ≥3 consec. pairs. */
function countHeldBoms(cards: Card[]): number {
  const counts = countByRank(cards)
  let units = 0
  for (let r = 0; r < RANKS.length; r++) if (counts[r] === 4) units++ // tứ quý
  let run = 0
  for (let r = 0; r < R2; r++) { // consecutive pairs (exclude 2)
    if (counts[r] >= 2) {
      run++
    } else {
      if (run >= 3) units++
      run = 0
    }
  }
  if (run >= 3) units++
  return units
}

function heldTwos(cards: Card[]): number {
  return cards.filter(c => c.rank === R2).length
}

/**
 * Pure settlement → per-seat score delta (sums to zero across all seats).
 * Covers: đếm-lá base, thối-heo, thối-bom, cóng, đền-khi-bị-chặt, and tới trắng.
 * Accepts a resolved Rules or a partial override (resolved internally). The on/off
 * flags gate each modifier: congEnabled, thoiHeoEnabled, thoiBomEnabled, denEnabled.
 */
export function settleRound(state: SettlementState, rules: Partial<Rules> = DEFAULT_RULES): Record<number, number> {
  const R = resolveRules(rules)
  const delta: Record<number, number> = {}
  for (const s of state.seats) delta[s] = 0

  // ── Tới trắng: instant winner collects a flat payout from everyone else. ──────
  if (state.instantWin) {
    const w = state.instantWin.seat
    for (const s of state.seats) {
      if (s === w) continue
      delta[s] -= R.toiTrangPayout
      delta[w] += R.toiTrangPayout
    }
    return delta
  }

  // ── Đếm-lá base + thối + cóng ─────────────────────────────────────────────────
  const w = state.winner
  for (const s of state.seats) {
    if (s === w) continue
    const hand = state.hands[s] ?? []
    const n = hand.length
    const cong = (state.playedCount[s] ?? 0) === 0

    // Card-count payment. Cóng (played 0) multiplies the full 13 when enabled;
    // otherwise it's base per remaining card.
    let cardPayment = (cong && R.congEnabled)
      ? 13 * R.basePerCard * R.congMultiplier
      : n * R.basePerCard

    // Thối-heo: still holding a 2 multiplies the card-count payment (stacks on cóng).
    const twos = heldTwos(hand)
    if (twos > 0 && R.thoiHeoEnabled) {
      cardPayment *= R.thoiHeoPerCard
        ? Math.pow(R.thoiHeoMultiplier, twos)
        : R.thoiHeoMultiplier
    }

    // Thối-bom: flat penalty per held tứ quý / đôi-thông bộ (added, not multiplied).
    const bomPenalty = R.thoiBomEnabled ? countHeldBoms(hand) * R.thoiBomPenalty : 0

    const payment = cardPayment + bomPenalty
    delta[s] -= payment
    delta[w] += payment
  }

  // ── Đền khi bị chặt: move denHeo/denBom from victim to cutter (0 when disabled). ─
  for (const ev of state.cutEvents ?? []) {
    const amount = R.denEnabled ? (ev.kind === 'heo' ? R.denHeo : R.denBom) : 0
    if (!(ev.cutVictim in delta)) delta[ev.cutVictim] = 0
    if (!(ev.cutter in delta)) delta[ev.cutter] = 0
    delta[ev.cutVictim] -= amount
    delta[ev.cutter] += amount
  }

  return delta
}

// ── Itemized settlement breakdown (for the đếm-lá scoreboard UI) ──────────────────
// Pure, ADDITIVE: this re-derives the SAME numbers settleRound produces, but exposes
// each component (lá còn, cóng, thối-heo, thối-bom, đền) so the presentation layer can
// show a readable breakdown instead of a single delta. It does NOT change scoring —
// every `total` equals the matching settleRound delta by construction.
export type SeatBreakdown = {
  seat: number
  isWinner: boolean
  cardsLeft: number        // lá còn
  cong: boolean            // played 0 cards this round
  heldTwos: number         // 2s (heo) still in hand → thối heo
  thoiHeoMult: number      // multiplier applied to the card payment (1 when none)
  thoiBomUnits: number     // held tứ quý / đôi-thông bộ → thối bom
  thoiBomPenalty: number   // flat bom penalty total
  cardPayment: number      // card-count payment after cóng + thối-heo
  denDelta: number         // net đền effect on this seat (+ as cutter, − as victim)
  total: number            // final per-seat delta (== settleRound)
}

export type RoundBreakdown = {
  instant: { seat: number; type: InstantWinType } | null
  toiTrangPayout: number
  seats: SeatBreakdown[]
}

/** Per-seat itemized breakdown mirroring settleRound (same totals, exposed parts). */
export function explainSettlement(state: SettlementState, rules: Partial<Rules> = DEFAULT_RULES): RoundBreakdown {
  const R = resolveRules(rules)
  const delta = settleRound(state, R) // authoritative totals — kept in lock-step

  // Tới trắng: a flat payout, no card breakdown.
  if (state.instantWin) {
    const w = state.instantWin.seat
    return {
      instant: state.instantWin,
      toiTrangPayout: R.toiTrangPayout,
      seats: state.seats.map(seat => ({
        seat,
        isWinner: seat === w,
        cardsLeft: (state.hands[seat] ?? []).length,
        cong: false,
        heldTwos: 0,
        thoiHeoMult: 1,
        thoiBomUnits: 0,
        thoiBomPenalty: 0,
        cardPayment: 0,
        denDelta: 0,
        total: delta[seat] ?? 0,
      })),
    }
  }

  // Net đền per seat (so winner/loser rows can show their đền line).
  const denBySeat: Record<number, number> = {}
  for (const s of state.seats) denBySeat[s] = 0
  for (const ev of state.cutEvents ?? []) {
    const amount = R.denEnabled ? (ev.kind === 'heo' ? R.denHeo : R.denBom) : 0
    denBySeat[ev.cutVictim] = (denBySeat[ev.cutVictim] ?? 0) - amount
    denBySeat[ev.cutter] = (denBySeat[ev.cutter] ?? 0) + amount
  }

  const w = state.winner
  const seats: SeatBreakdown[] = state.seats.map(seat => {
    const hand = state.hands[seat] ?? []
    const n = hand.length
    if (seat === w) {
      return {
        seat, isWinner: true, cardsLeft: 0, cong: false, heldTwos: 0,
        thoiHeoMult: 1, thoiBomUnits: 0, thoiBomPenalty: 0, cardPayment: 0,
        denDelta: denBySeat[seat] ?? 0, total: delta[seat] ?? 0,
      }
    }
    const cong = (state.playedCount[seat] ?? 0) === 0
    let cardPayment = (cong && R.congEnabled)
      ? 13 * R.basePerCard * R.congMultiplier
      : n * R.basePerCard
    const twos = heldTwos(hand)
    let thoiHeoMult = 1
    if (twos > 0 && R.thoiHeoEnabled) {
      thoiHeoMult = R.thoiHeoPerCard ? Math.pow(R.thoiHeoMultiplier, twos) : R.thoiHeoMultiplier
      cardPayment *= thoiHeoMult
    }
    const bomUnits = countHeldBoms(hand)
    const thoiBomPenalty = R.thoiBomEnabled ? bomUnits * R.thoiBomPenalty : 0
    return {
      seat, isWinner: false, cardsLeft: n, cong,
      heldTwos: twos, thoiHeoMult, thoiBomUnits: bomUnits, thoiBomPenalty,
      cardPayment, denDelta: denBySeat[seat] ?? 0, total: delta[seat] ?? 0,
    }
  })

  return { instant: null, toiTrangPayout: 0, seats }
}

/** Fold a round's deltas into cumulative per-seat scores (pure). */
export function applyDeltas(
  cumulative: Record<number, number>,
  delta: Record<number, number>,
): Record<number, number> {
  const out: Record<number, number> = { ...cumulative }
  for (const k of Object.keys(delta)) {
    const seat = Number(k)
    out[seat] = (out[seat] ?? 0) + delta[seat]
  }
  return out
}
