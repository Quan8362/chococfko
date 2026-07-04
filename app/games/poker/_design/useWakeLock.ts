'use client'

// ── Screen Wake Lock — optional, seated-gameplay-only, self-healing ──────────────────────────
//
// Keeps the phone/tablet screen awake while the viewer is seated in a live table so it doesn't dim
// mid-hand during an opponent's turn. It is OPT-IN (poker prefs → wakeLock), degrades silently on
// unsupported browsers (notably iOS < 16.4) and on permission failure, and is fully self-healing:
// the OS releases the sentinel whenever the tab is backgrounded, so we re-acquire on the next
// visibilitychange while still eligible. Never blocks gameplay, never touches authoritative state.

import { useEffect, useRef } from 'react'
import { shouldHoldWakeLock } from '@/lib/games/poker/mobileSession'

// Minimal structural shape of a WakeLockSentinel (avoids relying on lib DOM typings that may be
// absent). Presence of `navigator.wakeLock` is the real capability check.
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as WakeLockNavigator).wakeLock
}

// Holds a screen wake lock while `enabled && seated && document visible`. No return value — it is a
// pure side-effect tied to the component lifecycle; the lock is always released on unmount.
export function useWakeLock(enabled: boolean, seated: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    const supported = wakeLockSupported()
    let cancelled = false

    const release = async () => {
      const s = sentinelRef.current
      sentinelRef.current = null
      if (s && !s.released) {
        try {
          await s.release()
        } catch {
          /* already released / navigating away — nothing to do */
        }
      }
    }

    const acquire = async () => {
      if (sentinelRef.current || cancelled) return
      const nav = navigator as WakeLockNavigator
      if (!nav.wakeLock) return
      try {
        const s = await nav.wakeLock.request('screen')
        if (cancelled) {
          try {
            await s.release()
          } catch {
            /* ignore */
          }
          return
        }
        sentinelRef.current = s
        // The OS auto-releases on tab hide / power events — drop our ref so `sync()` re-acquires
        // when the page is visible + eligible again.
        s.addEventListener?.('release', () => {
          sentinelRef.current = null
        })
      } catch {
        // NotAllowedError (no gesture, low battery, embedded frame) — degrade silently; gameplay
        // must never depend on the wake lock.
      }
    }

    const sync = () => {
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
      if (shouldHoldWakeLock({ enabled, supported, seated, visible })) void acquire()
      else void release()
    }

    sync()
    const onVisibility = () => sync()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void release()
    }
  }, [enabled, seated])
}
