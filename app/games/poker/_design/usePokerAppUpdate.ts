'use client'

// ── usePokerAppUpdate — detect a newer deploy, surface it safely (never mid-hand) ────────────
//
// Polls `/api/version` on a SLOW cadence (visibility-gated) and compares the server's build id +
// poker protocol version against this client's baked values. When a newer app is live it exposes a
// non-blocking `updateAvailable`; the caller only *surfaces* it between hands (shouldPromptUpdate).
// A protocol mismatch additionally sets `mustBlock` so the action bar can stop submitting an intent
// the new server may no longer understand — the security boundary is still the server-side CAS.
//
// All timers, listeners, and in-flight fetches are torn down on unmount (§8). It never touches
// authoritative game state and degrades to a no-op if the probe fails (offline, dev, error).

import { useCallback, useEffect, useState } from 'react'
import {
  compareBuild,
  isProtocolCompatible,
  POKER_PROTOCOL_VERSION,
} from '@/lib/games/poker/pwa/version'

// The client's own build id, baked at build time (next.config.mjs → env.NEXT_PUBLIC_BUILD_ID).
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? null

// Slow safety-net cadence — this is a courtesy refresh nudge, not a hot loop. Re-checks also fire
// whenever the tab becomes visible (a returning player is exactly when a new deploy matters).
const POLL_MS = 5 * 60 * 1000

export interface PokerAppUpdate {
  /** the server is running a newer build than this client */
  readonly updateAvailable: boolean
  /** the server's poker protocol differs from this client's — a breaking mismatch */
  readonly mustBlock: boolean
  /** apply the update: message any waiting service worker, then reload to fetch the new build */
  readonly applyUpdate: () => void
}

interface VersionResponse {
  buildId?: unknown
  pokerProtocol?: unknown
}

export function usePokerAppUpdate(): PokerAppUpdate {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [mustBlock, setMustBlock] = useState(false)

  useEffect(() => {
    let cancelled = false
    let controller: AbortController | null = null

    const check = () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // Abort any earlier in-flight probe before starting a new one.
      controller?.abort()
      controller = new AbortController()
      fetch('/api/version', { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<VersionResponse>) : null))
        .then((data) => {
          if (cancelled || !data) return
          const serverBuild = typeof data.buildId === 'string' ? data.buildId : null
          const serverProto = typeof data.pokerProtocol === 'number' ? data.pokerProtocol : null
          const cmp = compareBuild(CLIENT_BUILD_ID, serverBuild)
          setUpdateAvailable(cmp === 'update-available')
          setMustBlock(serverProto !== null && !isProtocolCompatible(POKER_PROTOCOL_VERSION, serverProto))
        })
        .catch(() => {
          // Offline / aborted / dev — leave the last known state; never invent an update.
        })
    }

    check()
    const interval = window.setInterval(check, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    // Nudge a waiting service worker to take over (controlled update), then hard-reload so the new
    // HTML + freshly-hashed chunks load. The reload is a deliberate user gesture (button), so there
    // is no reload loop; the chunk-load guard (app/error.tsx) bounds any residual mismatch.
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.waiting?.postMessage('SKIP_WAITING')
        })
      }
    } catch {
      /* ignore — reload alone still fetches the new build */
    }
    try {
      window.location.reload()
    } catch {
      /* ignore */
    }
  }, [])

  return { updateAvailable, mustBlock, applyUpdate }
}
