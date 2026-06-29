'use client'

// ── useFullscreenLandscape — single source of truth for the TLMN immersive mode ──
// Cross-platform fullscreen + landscape with graceful degradation:
//   • native  — Fullscreen API present (Android Chrome/Edge/Firefox, desktop): real
//               fullscreen + best-effort screen.orientation.lock('landscape').
//   • pseudo  — iOS Safari / iPad (no element Fullscreen API) but still a phone/tablet:
//               CSS pseudo-fullscreen (position:fixed, 100dvh) + body scroll-lock.
//   • unsupported — desktop with no API / SSR: no-op (the auto behaviours that drive
//               the game are gated on isMobileOrTablet, so desktop never auto-enters).
//
// Every capability decision is RUNTIME FEATURE-DETECTION (never UA sniffing) so the
// code lights up automatically if Safari later ships the API. enter() MUST be invoked
// from a user gesture — requestFullscreen() rejects otherwise; the orientation lock is
// always best-effort and never undoes a fullscreen that already succeeded.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type FullscreenMode = 'native' | 'pseudo' | 'unsupported'

export interface FullscreenLandscape {
  /** Attach to the element that should fill the screen (the TLMN table wrapper). */
  rootRef: RefObject<HTMLDivElement>
  /** True when the STANDARD element Fullscreen API is usable (Chrome desktop / Android). */
  isSupported: boolean
  /** Native fullscreen element OR pseudo-fullscreen currently active. */
  isFullscreen: boolean
  isLandscape: boolean
  isMobileOrTablet: boolean
  /** Running as an installed PWA (Home-Screen web app) — display-mode standalone. */
  isStandalone: boolean
  mode: FullscreenMode
  /** Must be called from inside a tap handler. */
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
}

// SSR-safe matchMedia read.
function mq(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try { return window.matchMedia(query).matches } catch { return false }
}

// Feature-detection only: a coarse pointer or a multi-touch screen ⇒ phone/tablet.
// iPadOS that masquerades as desktop Safari still reports maxTouchPoints > 1.
function detectMobileOrTablet(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = mq('(pointer: coarse)')
  const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 1
  return coarse || touch
}

// STANDARD feature-detection only (no UA sniffing): the element Fullscreen API must be
// BOTH enabled on the document AND present on a real element. This is the single gate the
// spec asks for —
//   supportsFullscreen = Boolean(document.fullscreenEnabled) && Boolean(el.requestFullscreen)
// — and it is exactly what correctly routes Chrome on iPhone/iPad (which expose NEITHER for
// non-video elements) to the in-page immersive fallback, while Chrome desktop / Android get
// real fullscreen. We deliberately do NOT count the webkit-prefixed element API: on iOS that
// only exists for <video>, and treating it as "supported" is the classic iOS fullscreen bug.
function nativeFullscreenSupported(el?: Element | null): boolean {
  if (typeof document === 'undefined') return false
  if (!document.fullscreenEnabled) return false
  const target = (el ?? document.documentElement) as unknown as { requestFullscreen?: unknown }
  return typeof target.requestFullscreen === 'function'
}

// Installed-PWA / Home-Screen web-app detection (display-mode standalone, or the legacy
// iOS Safari navigator.standalone flag).
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navStandalone
}

function currentFullscreenEl(): Element | null {
  if (typeof document === 'undefined') return null
  const d = document as unknown as { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null }
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function useFullscreenLandscape(): FullscreenLandscape {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [supported, setSupported] = useState(false)
  const [mode, setMode] = useState<FullscreenMode>('unsupported')
  const pseudoRef = useRef(false) // currently in CSS pseudo-fullscreen?
  const lockedRef = useRef(false) // did we acquire an orientation lock to release?

  // One-time capability detection (client only — SSR renders the desktop default).
  useEffect(() => {
    const mobile = detectMobileOrTablet()
    const nativeOk = nativeFullscreenSupported()
    setIsMobileOrTablet(mobile)
    setSupported(nativeOk)
    setMode(nativeOk ? 'native' : mobile ? 'pseudo' : 'unsupported')
    setIsStandalone(detectStandalone())
    // The PWA display-mode can change at runtime (e.g. launched from Home Screen).
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const sm = window.matchMedia('(display-mode: standalone)')
      const onSm = () => setIsStandalone(detectStandalone())
      sm.addEventListener?.('change', onSm)
      return () => sm.removeEventListener?.('change', onSm)
    }
  }, [])

  const applyPseudo = useCallback((on: boolean) => {
    const el = rootRef.current
    if (!el || typeof document === 'undefined') return
    if (on) {
      el.classList.add('pseudo-fullscreen')
      document.body.classList.add('tlmn-scroll-lock')
    } else {
      el.classList.remove('pseudo-fullscreen')
      document.body.classList.remove('tlmn-scroll-lock')
    }
    pseudoRef.current = on
  }, [])

  // Keep isLandscape + isFullscreen in sync with the system. Covers Esc / system-back /
  // edge-swipe exits (fullscreenchange) AND device rotation (orientation/resize/mql).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncLandscape = () => setIsLandscape(mq('(orientation: landscape)'))
    const syncFs = () => {
      const fsEl = currentFullscreenEl()
      // The user left native fullscreen (Esc/back/gesture) — release any lock we took
      // so the page restores cleanly (nav reappears via the browser, scroll intact).
      if (!fsEl && lockedRef.current) {
        try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.() } catch { /* noop */ }
        lockedRef.current = false
      }
      setIsFullscreen(!!fsEl || pseudoRef.current)
    }
    // A real-fullscreen REQUEST that the browser rejects asynchronously fires this. On a
    // phone/tablet, degrade to the in-page immersive fallback so the game still fills the
    // viewport; on desktop just stay windowed.
    const onFsError = () => {
      if (!currentFullscreenEl() && detectMobileOrTablet()) applyPseudo(true)
      setIsFullscreen(!!currentFullscreenEl() || pseudoRef.current)
    }
    syncLandscape()
    syncFs()

    const mql = window.matchMedia('(orientation: landscape)')
    mql.addEventListener?.('change', syncLandscape)
    window.addEventListener('resize', syncLandscape)
    window.addEventListener('orientationchange', syncLandscape)
    document.addEventListener('fullscreenchange', syncFs)
    document.addEventListener('webkitfullscreenchange', syncFs as EventListener)
    document.addEventListener('fullscreenerror', onFsError)
    document.addEventListener('webkitfullscreenerror', onFsError as EventListener)

    return () => {
      mql.removeEventListener?.('change', syncLandscape)
      window.removeEventListener('resize', syncLandscape)
      window.removeEventListener('orientationchange', syncLandscape)
      document.removeEventListener('fullscreenchange', syncFs)
      document.removeEventListener('webkitfullscreenchange', syncFs as EventListener)
      document.removeEventListener('fullscreenerror', onFsError)
      document.removeEventListener('webkitfullscreenerror', onFsError as EventListener)
    }
  }, [applyPseudo])

  const enter = useCallback(async () => {
    const el = rootRef.current
    if (!el || typeof document === 'undefined') return
    // Feature-detect against the ACTUAL element (not just documentElement) — this is the
    // gate that decides REAL fullscreen vs the in-page immersive fallback.
    if (nativeFullscreenSupported(el)) {
      // Native path (Android + desktop). MUST run inside a user gesture. navigationUI:'hide'
      // asks the browser to drop its own UI where permitted (ignored where it can't).
      try {
        await el.requestFullscreen({ navigationUI: 'hide' })
      } catch {
        // Fullscreen refused (rare) — on mobile fall back to pseudo so it still fills.
        if (detectMobileOrTablet()) applyPseudo(true)
        setIsFullscreen(!!currentFullscreenEl() || pseudoRef.current)
        return
      }
      // Orientation lock is best-effort: it rejects on desktop, iOS, or when the user/OS
      // forbids it — that must NEVER undo the fullscreen we just acquired.
      try {
        const lock = (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock
        if (lock) { await lock.call(screen.orientation, 'landscape'); lockedRef.current = true }
      } catch { /* lock unsupported / rejected — leave fullscreen as-is */ }
    } else if (detectMobileOrTablet()) {
      // iOS-like (no element Fullscreen API) → CSS pseudo-fullscreen.
      applyPseudo(true)
    }
    setIsFullscreen(!!currentFullscreenEl() || pseudoRef.current)
  }, [applyPseudo])

  const exit = useCallback(async () => {
    if (typeof document === 'undefined') return
    if (currentFullscreenEl()) {
      try {
        const ex = (document as unknown as { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => Promise<void> })
        const fn = ex.exitFullscreen ?? ex.webkitExitFullscreen
        if (fn) await fn.call(document)
      } catch { /* noop */ }
    }
    if (lockedRef.current) {
      try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.() } catch { /* noop */ }
      lockedRef.current = false
    }
    if (pseudoRef.current) applyPseudo(false)
    setIsFullscreen(!!currentFullscreenEl() || pseudoRef.current)
  }, [applyPseudo])

  const toggle = useCallback(async () => {
    if (isFullscreen) await exit(); else await enter()
  }, [isFullscreen, enter, exit])

  // Safety net: if the component unmounts while pseudo-active, restore scroll + class.
  useEffect(() => () => {
    if (pseudoRef.current) {
      rootRef.current?.classList.remove('pseudo-fullscreen')
      if (typeof document !== 'undefined') document.body.classList.remove('tlmn-scroll-lock')
      pseudoRef.current = false
    }
    if (lockedRef.current) {
      try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.() } catch { /* noop */ }
      lockedRef.current = false
    }
  }, [])

  return { rootRef, isSupported: supported, isFullscreen, isLandscape, isMobileOrTablet, isStandalone, mode, enter, exit, toggle }
}
