'use client'

// Fire-and-forget mission ping. Mounts on a page whose mere visit satisfies an 'action' mission
// (e.g. reading the rules) and records it ONCE per mount. Renders nothing. Best-effort: the server
// action is idempotent (clamped at target) and degrade-safe (no-op when the flag/migration is off),
// so a repeat visit or a disabled feature costs nothing and never surfaces an error to the user.

import { useEffect, useRef } from 'react'

export default function PokerMissionPing({ action }: { action: () => Promise<unknown> }) {
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    void action().catch(() => { /* best-effort */ })
  }, [action])
  return null
}
