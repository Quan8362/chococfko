// ── Poker TOURNAMENT domain types — TYPE-ONLY foundation ───────────────────────────────
//
// PURE module — no React, no Supabase, no clock, no process.env. Defines the vocabulary the
// tournament engine (stateMachine/blinds/registration/prizePool/payout/balancing/elimination)
// shares. Canonical rule IDs live in docs/poker/tournaments/*.md.
//
// A tournament is a SEPARATE domain that sits BESIDE the cash-game engine (engine-specification.md
// §0). The cash hand engine is reused unchanged to play hands; this layer owns everything around
// the hand. Tournament CHIPS are isolated from wallet coins and can never be cashed out
// (TNMT-CHIP). All coin/chip math is INTEGER (COIN-INT-001).

// ── Tournament lifecycle states (TNMT-STATE) ───────────────────────────────────────────
export type TournamentState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'REGISTRATION_OPEN'
  | 'STARTING'
  | 'RUNNING'
  | 'BREAK'
  | 'FINAL_TABLE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PAUSED_FOR_REVIEW'

// The live states a PAUSED_FOR_REVIEW can pause from / resume to.
export type LiveTournamentState = 'STARTING' | 'RUNNING' | 'BREAK' | 'FINAL_TABLE'

// ── Player / entry lifecycle states (TNMT-PSTATE) ──────────────────────────────────────
export type EntryState =
  | 'REGISTERED'
  | 'SEATED'
  | 'ACTIVE'
  | 'DISCONNECTED'
  | 'ELIMINATED'
  | 'REBUY_ELIGIBLE'
  | 'WITHDRAWN'
  | 'PAID'

// ── Blind structure (TNMT-BLIND) ───────────────────────────────────────────────────────
// A level is either a play level (blinds/ante > 0) or a break (isBreak, no blinds). Duration is
// in whole seconds; the server-authoritative clock resolves the current level from elapsed time.
export interface BlindLevel {
  readonly level: number          // 1-based ordinal in the structure
  readonly smallBlind: number     // integer chips (0 for a break)
  readonly bigBlind: number       // integer chips (0 for a break)
  readonly ante: number           // integer chips per player (0 = no ante)
  readonly durationSeconds: number
  readonly isBreak: boolean
}

export interface BlindStructure {
  readonly id: string
  readonly levels: readonly BlindLevel[]
}

// The resolved "where are we in the clock" answer (pure function of elapsed time).
export interface BlindClock {
  readonly currentLevel: BlindLevel
  readonly nextLevel: BlindLevel | null      // null after the last level
  readonly levelIndex: number                // 0-based index into levels[]
  readonly secondsIntoLevel: number
  readonly secondsRemainingInLevel: number   // Infinity-safe: finite for finite durations
  readonly onBreak: boolean
}

// ── Payout structure (TNMT-PAY) ────────────────────────────────────────────────────────
// A paid-places ladder: for a field of `minEntries..` players, `paidPlaces` places are paid with
// the given integer `weights` (index 0 = 1st). Weights need not sum to any particular number;
// shares are weight_i / sum(weights). The ladder rows are matched by descending minEntries.
export interface PayoutTier {
  readonly minEntries: number       // applies when fieldSize >= this (highest matching row wins)
  readonly weights: readonly number[]  // one weight per paid place, 1st..last-paid
}

export interface PayoutStructure {
  readonly id: string
  readonly tiers: readonly PayoutTier[]   // must be sorted/lookup-safe; resolver sorts defensively
}

// ── Tournament configuration (versioned, config-driven) ───────────────────────────────
export interface TournamentConfig {
  readonly entryFee: number             // wallet coins deducted per entry (integer, > 0)
  readonly startingStack: number        // tournament chips granted per entry (integer, > 0)
  readonly minEntries: number           // below this at start → auto-cancel + full refund
  readonly maxEntries: number           // registration cap
  readonly seatsPerTable: number        // table capacity (e.g. 6)
  readonly blindStructure: BlindStructure
  readonly payoutStructure: PayoutStructure
  readonly guaranteedPrizePool: number  // 0 = no guarantee; else overlay foundation (TNMT-PAY-021)
  // Late registration: allowed until this level index (0-based) has ended. null = no late reg.
  readonly lateRegUntilLevelIndex: number | null
  // Re-entry: max additional entries per user (0 = no re-entry). Allowed only while
  // reEntryUntilLevelIndex has not passed.
  readonly maxReEntriesPerUser: number
  readonly reEntryUntilLevelIndex: number | null
}

// ── Entry snapshot (public-safe; no hole cards ever) ───────────────────────────────────
export interface TournamentEntry {
  readonly entryId: string
  readonly userId: string
  readonly seq: number              // 0 = first entry, 1.. = re-entries by the same user
  readonly state: EntryState
  readonly chips: number            // current tournament chips (0 when busted)
  readonly tableId: string | null   // null before seating / after bust
  readonly seatIndex: number | null
  readonly finishingPlace: number | null  // assigned on final bust (1 = winner)
}

// ── Table snapshot (public-safe) ───────────────────────────────────────────────────────
export interface TournamentTableView {
  readonly tableId: string
  readonly seats: readonly (TournamentEntry | null)[]  // by seat index; null = empty
  readonly breaking: boolean
}

// A pending, not-yet-applied balancing move (TNMT-BAL-028).
export interface PendingMove {
  readonly entryId: string
  readonly fromTableId: string
  readonly toTableId: string
  readonly toSeatIndex: number
}

// ── Elimination record (append-only, drives payout) ────────────────────────────────────
export interface EliminationRecord {
  readonly entryId: string
  readonly userId: string
  readonly finishingPlace: number
  readonly handNo: number
  // Chips this entry STARTED the busting hand with — the tie-break key (TNMT-ELIM-003).
  readonly chipsAtHandStart: number
  // True when this bust shares a place with another (same-hand true tie, TNMT-PAY-026).
  readonly tied: boolean
}

// ── Payout record (settlement output) ──────────────────────────────────────────────────
export interface PayoutRecord {
  readonly entryId: string
  readonly userId: string
  readonly place: number | null   // null for a refund row (TNMT-CANCEL)
  readonly amount: number         // integer coins credited to the wallet
}
