'use client'

// ── Responsive classification ───────────────────────────────────────────────────────────────
//
// Poker is LANDSCAPE-ONLY (visual-spec). The layout class is chosen from real viewport geometry
// — width, height, aspect ratio and orientation — NOT user-agent sniffing (which the spec
// forbids). Portrait on ANY device yields `portrait`, which the UI renders as the polished
// Rotate-Device screen (never a squeezed table).
//
// Re-evaluates on resize, orientationchange and the visualViewport changes that fire when the
// mobile browser toolbar shows/hides (so the table re-fits when chrome collapses). All geometry
// downstream is anchored to an inner play-area %, never to these raw numbers — this hook only
// picks the breakpoint bucket (the explicit tlmn-seat-positioning lesson).

import { useEffect, useState } from 'react'

export type PokerLayout = 'desktop' | 'tablet' | 'mobile' | 'portrait'

export interface ViewportInfo {
  readonly layout: PokerLayout
  readonly width: number
  readonly height: number
  readonly aspect: number // width / height
  readonly isLandscape: boolean
  readonly isPortrait: boolean
  // true once the hook has measured the real client (SSR renders a safe default first)
  readonly ready: boolean
}

// Breakpoints by the SHORTER landscape dimension (height) + aspect, so a wide-but-short phone in
// landscape classifies as mobile and a roomy iPad as tablet. Tuned against the three table assets
// (desktop/mobile 16:9, tablet 4:3).
function classify(w: number, h: number): PokerLayout {
  const aspect = h > 0 ? w / h : 0
  // Portrait (or near-square taller-than-wide) → rotate screen. A small tolerance avoids
  // flipping to "table" during the brief square frame mid-rotation.
  if (aspect < 1.05) return 'portrait'
  // Landscape buckets by available height.
  if (h >= 760 && w >= 1024) return 'desktop'
  if (h >= 560 && w >= 900) return 'tablet'
  return 'mobile'
}

const SSR_DEFAULT: ViewportInfo = {
  layout: 'desktop',
  width: 1280,
  height: 800,
  aspect: 1.6,
  isLandscape: true,
  isPortrait: false,
  ready: false,
}

export function useViewportClass(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(SSR_DEFAULT)

  useEffect(() => {
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Prefer visualViewport (excludes the soft toolbar) when present; fall back to innerW/H.
        const vv = window.visualViewport
        const w = Math.round(vv?.width ?? window.innerWidth)
        const h = Math.round(vv?.height ?? window.innerHeight)
        const layout = classify(w, h)
        const aspect = h > 0 ? w / h : 0
        setInfo({
          layout,
          width: w,
          height: h,
          aspect,
          isLandscape: aspect >= 1.05,
          isPortrait: aspect < 1.05,
          ready: true,
        })
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])

  return info
}
