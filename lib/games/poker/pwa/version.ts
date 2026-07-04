// ── App-version & protocol compatibility (PURE, DOM-free) ────────────────────────────────────
//
// The rules that decide (a) whether a newer deploy is available and (b) whether it is *safe to
// surface* an update prompt right now. Kept pure so every gate is a unit-testable fact; the React
// hook (`app/games/poker/_design/usePokerAppUpdate.ts`) owns the polling + reload.
//
// Version signal: every build bakes `NEXT_PUBLIC_BUILD_ID` into the client bundle AND stamps it as
// Next's own build id (so `/_next/static/<BUILD_ID>/…` matches — see next.config.mjs). `/api/version`
// echoes the SERVER's current build id + poker protocol version. When they diverge, a newer app is
// live. We never force a reload mid-hand: the prompt is only *surfaced* between hands.

// Bump on a BREAKING change to the client↔server poker action/snapshot contract. A mismatch is a
// hard signal that the running client can no longer be trusted to act; a build-id-only change is a
// soft "please refresh when convenient". The server re-validates every action via the expected-seq
// CAS regardless, so this is a UX gate, not the security boundary.
export const POKER_PROTOCOL_VERSION = 1

export type BuildComparison = 'same' | 'update-available' | 'unknown'

// Compare the running client's baked build id with the server's current one. `unknown` when either
// side is missing (dev, offline, a failed poll) — the caller treats `unknown` as "no prompt".
export function compareBuild(
  clientId: string | null | undefined,
  serverId: string | null | undefined,
): BuildComparison {
  if (!clientId || !serverId) return 'unknown'
  return clientId === serverId ? 'same' : 'update-available'
}

// A protocol bump is a BREAKING mismatch: the client's action shape may no longer be understood.
// Exact-match only — any difference is incompatible.
export function isProtocolCompatible(clientVersion: number, serverVersion: number): boolean {
  return clientVersion === serverVersion
}

export interface UpdateState {
  /** server build id differs from the client's baked build id */
  readonly updateAvailable: boolean
  /** server poker protocol differs from the client's — a breaking, hard-stop mismatch */
  readonly protocolMismatch: boolean
  /** a hand is live AND the viewer is engaged in it (seated, not yet settled) */
  readonly inHand: boolean
}

// Whether to SURFACE the (non-blocking) update affordance. Never interrupt a live hand for a routine
// build refresh — a seated player finishes the hand first ("offer update after the hand where
// practical"). A spectator or a between-hands player sees it immediately.
export function shouldPromptUpdate(s: UpdateState): boolean {
  if (!s.updateAvailable) return false
  return !s.inHand
}

// Whether the client must STOP submitting actions because it is protocol-incompatible with the
// server. Independent of `inHand`: a hard mismatch means the current client can corrupt nothing
// (the server would reject it) but must not silently keep trying — the UI blocks new intents and
// asks the player to reload. Build-id-only drift never blocks play.
export function mustBlockActions(s: Pick<UpdateState, 'protocolMismatch'>): boolean {
  return s.protocolMismatch
}
