// ── Poker coin-integrity invariant checker (PURE) ───────────────────────────────────────────
//
// The zero-tolerance safety net for virtual-coin ("xu") movement. Given the economic snapshot of a
// settled (or to-be-settled) hand — per-seat contributions, pot totals, payouts, refunds, and the
// authoritative total — it verifies the conservation laws poker must never break and returns a set
// of typed violations. A caller (metrics-data / a settlement guard / a scheduled auditor) turns any
// violation into a high-severity incident, freezes unsafe settlement, and preserves evidence.
//
// It is PURE and integer-only:
//   • no DB, no React, no console, no secrets, and it never sees a card value;
//   • all inputs must be integers (checked) — floating-point coin math is a bug, not a rounding
//     nuisance, so a non-integer input is itself reported as a violation rather than silently
//     coerced;
//   • the `evidence` on every violation carries ONLY numbers + correlation ids (table/hand), so an
//     alert built from it can never expose private cards (SECURITY-HOLE-CARDS-001).

export type IntegrityCode =
  | 'POT_CONSTRUCTION_MISMATCH'   // sum(contributions) != declared pot total
  | 'CONSERVATION_MISMATCH'       // money out (payouts+refunds) != money in (total contributed)
  | 'SETTLEMENT_RECONCILE_MISMATCH' // authoritative total != reconstructed contributions
  | 'NEGATIVE_VALUE'              // a stack / contribution / payout is negative
  | 'NON_INTEGER_VALUE'          // a coin value is not an integer
  | 'DUPLICATE_SETTLEMENT'       // more than one settlement observed for the hand
  | 'PAYOUT_TO_INELIGIBLE_SEAT'  // a seat received a payout it was not eligible for
  | 'LEDGER_IMBALANCE'           // wallet balance != starting balance + ledger delta

export type IntegritySeverity = 'critical' | 'high'

export interface IntegrityCorrelation {
  readonly tableId?: string | null
  readonly handId?: string | null
}

export interface IntegrityViolation {
  readonly code: IntegrityCode
  readonly severity: IntegritySeverity
  /** Stable, non-sensitive summary. Never contains card values. */
  readonly message: string
  /** Numbers-only evidence for the incident + correlation ids. */
  readonly evidence: Record<string, number | string>
  readonly correlation: IntegrityCorrelation
}

export interface IntegrityReport {
  readonly ok: boolean
  readonly violations: readonly IntegrityViolation[]
  /** Highest severity present, or null when ok. */
  readonly worst: IntegritySeverity | null
}

// ── Hand economic snapshot ──────────────────────────────────────────────────────────────────
export interface SeatContribution {
  readonly seatIndex: number
  /** Total coins this seat put into the pot across all streets (integer). */
  readonly contributed: number
}
export interface SeatPayout {
  readonly seatIndex: number
  readonly amount: number
}

export interface HandIntegrityInput {
  readonly tableId?: string | null
  readonly handId?: string | null
  readonly contributions: readonly SeatContribution[]
  /** Declared pot grand total (main + sides). */
  readonly declaredPotTotal: number
  readonly payouts: readonly SeatPayout[]
  readonly refunds: readonly SeatPayout[]
  /** Authoritative total contributed as recorded by settlement. */
  readonly authoritativeTotalContributed: number
  /** How many settlement rows exist for this hand (should be exactly 1 once settled). */
  readonly settlementRowCount?: number
  /** Seats eligible to win (optional stricter check). When provided, payouts to others are flagged. */
  readonly eligibleSeatIndexes?: readonly number[]
}

// ── Integer guard ─────────────────────────────────────────────────────────────────────────
function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

function collectValues(input: HandIntegrityInput): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [{ label: 'declaredPotTotal', value: input.declaredPotTotal }, { label: 'authoritativeTotalContributed', value: input.authoritativeTotalContributed }]
  input.contributions.forEach((c) => out.push({ label: `contrib[${c.seatIndex}]`, value: c.contributed }))
  input.payouts.forEach((p) => out.push({ label: `payout[${p.seatIndex}]`, value: p.amount }))
  input.refunds.forEach((r) => out.push({ label: `refund[${r.seatIndex}]`, value: r.amount }))
  return out
}

/**
 * Validate the conservation laws for a single hand. Returns every violation found (does not
 * short-circuit) so an operator sees the full picture in one incident.
 */
export function checkHandCoinIntegrity(input: HandIntegrityInput): IntegrityReport {
  const correlation: IntegrityCorrelation = { tableId: input.tableId ?? null, handId: input.handId ?? null }
  const violations: IntegrityViolation[] = []
  const push = (code: IntegrityCode, severity: IntegritySeverity, message: string, evidence: Record<string, number | string>) =>
    violations.push({ code, severity, message, evidence, correlation })

  // 0. Integer + non-negative guards. A non-integer coin value is a critical class of bug.
  for (const { label, value } of collectValues(input)) {
    if (!isInt(value)) {
      push('NON_INTEGER_VALUE', 'critical', `non-integer coin value at ${label}`, { at: label, value: Number.isFinite(value) ? value : 0 })
    } else if (value < 0) {
      push('NEGATIVE_VALUE', 'critical', `negative coin value at ${label}`, { at: label, value })
    }
  }

  const sumContrib = input.contributions.reduce((s, c) => s + (isInt(c.contributed) ? c.contributed : 0), 0)
  const sumPayouts = input.payouts.reduce((s, p) => s + (isInt(p.amount) ? p.amount : 0), 0)
  const sumRefunds = input.refunds.reduce((s, r) => s + (isInt(r.amount) ? r.amount : 0), 0)

  // 1. Pot construction: contributions must equal the declared pot.
  if (isInt(input.declaredPotTotal) && sumContrib !== input.declaredPotTotal) {
    push('POT_CONSTRUCTION_MISMATCH', 'critical', 'sum of contributions does not equal declared pot total',
      { sumContrib, declaredPotTotal: input.declaredPotTotal, delta: sumContrib - input.declaredPotTotal })
  }

  // 2. Conservation: money awarded (payouts + refunds) must equal money contributed.
  if (isInt(input.authoritativeTotalContributed) && sumPayouts + sumRefunds !== input.authoritativeTotalContributed) {
    push('CONSERVATION_MISMATCH', 'critical', 'payouts + refunds do not equal total contributed',
      { sumPayouts, sumRefunds, out: sumPayouts + sumRefunds, in: input.authoritativeTotalContributed, delta: sumPayouts + sumRefunds - input.authoritativeTotalContributed })
  }

  // 3. Reconciliation: reconstructed contributions must match the authoritative total.
  if (isInt(input.authoritativeTotalContributed) && sumContrib !== input.authoritativeTotalContributed) {
    push('SETTLEMENT_RECONCILE_MISMATCH', 'critical', 'reconstructed contributions do not match authoritative total',
      { sumContrib, authoritativeTotalContributed: input.authoritativeTotalContributed, delta: sumContrib - input.authoritativeTotalContributed })
  }

  // 4. Duplicate settlement — idempotency breach.
  if (input.settlementRowCount !== undefined && input.settlementRowCount > 1) {
    push('DUPLICATE_SETTLEMENT', 'critical', 'more than one settlement row observed for this hand',
      { settlementRowCount: input.settlementRowCount })
  }

  // 5. Payouts to ineligible seats (optional stricter check).
  if (input.eligibleSeatIndexes) {
    const eligible = new Set(input.eligibleSeatIndexes)
    for (const p of input.payouts) {
      if (p.amount > 0 && !eligible.has(p.seatIndex)) {
        push('PAYOUT_TO_INELIGIBLE_SEAT', 'high', 'payout awarded to a seat not eligible for the pot',
          { seatIndex: p.seatIndex, amount: p.amount })
      }
    }
  }

  const worst = violations.some((v) => v.severity === 'critical') ? 'critical'
    : violations.length > 0 ? 'high' : null
  return { ok: violations.length === 0, violations, worst }
}

// ── Wallet ledger conservation (generic) ────────────────────────────────────────────────────
export interface LedgerCheckInput {
  readonly userId?: string | null
  readonly startingBalance: number
  /** Signed sum of all ledger entries in the window. */
  readonly ledgerDelta: number
  /** The wallet's current authoritative balance. */
  readonly currentBalance: number
}

/** A wallet's current balance must equal starting balance + the signed ledger delta. */
export function checkLedgerConservation(input: LedgerCheckInput): IntegrityReport {
  const correlation: IntegrityCorrelation = {}
  const violations: IntegrityViolation[] = []
  for (const [label, value] of [['startingBalance', input.startingBalance], ['ledgerDelta', input.ledgerDelta], ['currentBalance', input.currentBalance]] as const) {
    if (!isInt(value)) {
      violations.push({ code: 'NON_INTEGER_VALUE', severity: 'critical', message: `non-integer wallet value at ${label}`, evidence: { at: label }, correlation })
    }
  }
  if (violations.length === 0) {
    const expected = input.startingBalance + input.ledgerDelta
    if (expected !== input.currentBalance) {
      violations.push({
        code: 'LEDGER_IMBALANCE', severity: 'critical',
        message: 'wallet balance does not equal starting balance + ledger delta',
        evidence: { expected, currentBalance: input.currentBalance, delta: input.currentBalance - expected, ...(input.userId ? { userId: input.userId } : {}) },
        correlation,
      })
    }
    if (input.currentBalance < 0) {
      violations.push({ code: 'NEGATIVE_VALUE', severity: 'critical', message: 'wallet balance is negative', evidence: { currentBalance: input.currentBalance }, correlation })
    }
  }
  const worst = violations.some((v) => v.severity === 'critical') ? 'critical' : violations.length ? 'high' : null
  return { ok: violations.length === 0, violations, worst }
}

/** Merge several reports into one (e.g. per-hand + per-wallet checks in a scheduled audit). */
export function mergeIntegrityReports(reports: readonly IntegrityReport[]): IntegrityReport {
  const violations = reports.flatMap((r) => r.violations)
  const worst = violations.some((v) => v.severity === 'critical') ? 'critical' : violations.length ? 'high' : null
  return { ok: violations.length === 0, violations, worst }
}
