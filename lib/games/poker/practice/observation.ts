// ── Poker PRACTICE server-side BotObservation builder (pure, trusted) ─────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by observation.test.ts.
//
// 🔴 This is the SERVER's construction of the fairness-bounded `BotObservation`. It is a NARROW,
// ALLOWLISTED builder — it does NOT take a big snapshot and redact it. It reads only:
//   • the public authoritative betting state (`HandState` — which by design contains NO hole
//     cards and NO undealt deck card), and
//   • the acting bot's OWN two hole cards, passed as a single explicit argument.
//
// There is structurally no parameter through which another seat's cards, the deck order, the
// shuffle seed, the server RNG, or any private/admin metadata could arrive. The result is then
// re-checked by `assertObservationClean` (defence in depth) before it is returned.

import type { Card } from '../types.ts'
import type { HandState } from '../hand.ts'
import { legalActions, amountToCall, minRaiseTo, maxRaiseTo } from '../betting.ts'
import {
  buildObservation,
  assertObservationClean,
  type BotObservation,
  type ObservedSeat,
  type PublicActionEntry,
} from '../bot/observation.ts'

function observedSeats(state: HandState): ObservedSeat[] {
  return state.round.players
    .map((p) => ({
      seatIndex: p.seatIndex,
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      committedTotal: p.committedTotal,
      status: p.status,
      inHand: p.status === 'active' || p.status === 'allin',
    }))
    .sort((a, b) => a.seatIndex - b.seatIndex)
}

// Build the observation a bot at `seatIndex` is allowed to see, from authoritative server state.
// `ownHole` MUST be exactly that seat's two cards (the runtime reads it from the server-only
// holeBySeat map). `history` is the public action history the runtime accumulates (public info).
//
// Throws if it is not that seat's turn or the seat cannot act — the worker must not ask a policy
// to act out of turn.
export function buildServerObservation(
  state: HandState,
  seatIndex: number,
  ownHole: readonly [Card, Card],
  history: readonly PublicActionEntry[] = [],
): BotObservation {
  if (state.turnSeat !== seatIndex) {
    throw new Error(`practice observation: seat ${seatIndex} is not the current actor`)
  }
  const legal = legalActions(state.round, seatIndex)
  if (legal.length === 0) {
    throw new Error(`practice observation: seat ${seatIndex} has no legal actions`)
  }

  const obs = buildObservation({
    seatIndex,
    holeCards: ownHole,
    // HandState.board is ALREADY revealed-streets-only; buildObservation re-slices by street, so
    // a future board card cannot be present even in principle.
    fullBoard: state.board as readonly Card[],
    street: state.street,
    seats: observedSeats(state),
    buttonSeat: state.buttonSeat,
    bigBlind: state.bigBlind,
    currentBet: state.round.currentBet,
    toCall: amountToCall(state.round, seatIndex),
    minRaiseTo: minRaiseTo(state.round),
    maxRaiseTo: maxRaiseTo(state.round, seatIndex),
    legal,
    actionHistory: history,
  })

  // Defence in depth: a leaked hidden-info key or a street/board mismatch throws here, converting
  // any future wiring mistake into a loud server error instead of a silent fairness breach.
  assertObservationClean(obs)
  return obs
}
