// A tiny module-level snapshot of the live Caro game's runtime state. CaroGame
// keeps it current; the room-level error boundary (a separate component that
// cannot read CaroGame's refs) reads it so a crash report carries the realtime
// channel status, match status, last realtime event, and what had loaded.
//
// Intentionally non-reactive and PII-free — diagnostics only.

export type CaroRuntimeSnapshot = {
  roomCode: string | null
  channelStatus: string | null
  matchStatus: string | null
  lastRealtimeEvent: string | null
  loaded: { room: boolean; player: boolean; game: boolean } | null
}

let snapshot: CaroRuntimeSnapshot = {
  roomCode: null,
  channelStatus: null,
  matchStatus: null,
  lastRealtimeEvent: null,
  loaded: null,
}

export function setCaroRuntime(partial: Partial<CaroRuntimeSnapshot>): void {
  snapshot = { ...snapshot, ...partial }
}

export function getCaroRuntime(): CaroRuntimeSnapshot {
  return snapshot
}

export function resetCaroRuntime(): void {
  snapshot = {
    roomCode: null,
    channelStatus: null,
    matchStatus: null,
    lastRealtimeEvent: null,
    loaded: null,
  }
}
