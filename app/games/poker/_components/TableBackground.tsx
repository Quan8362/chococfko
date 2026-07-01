'use client'

// ── TableBackground — art-directed felt image, only the critical asset loaded ────────────────
//
// Picks ONE of the three table assets by layout and loads ONLY that one (never all three). The
// chosen image is preloaded via react-dom's `preload` so the felt paints fast, and rendered with
// object-fit:cover so the crop-safe composition + aspect ratio are preserved at any size. A dark
// vignette overlay keeps seat/pot/board text legible over the busy felt (visual-spec §6). No UI
// is baked into the image — all interactive geometry is anchored to the inner play area on top.

import { useEffect } from 'react'
import ReactDOM from 'react-dom'
import type { PokerLayout } from '../_design/useViewportClass'

const ASSET: Record<Exclude<PokerLayout, 'portrait'>, string> = {
  desktop: '/poker-desktop.webp', // 1672×941 16:9
  tablet: '/poker-tablet.webp', // 1448×1086 4:3
  mobile: '/poker-mobile.webp', // 1672×941 16:9 (landscape-locked)
}

export function tableAssetFor(layout: PokerLayout): string {
  return ASSET[layout === 'portrait' ? 'mobile' : layout]
}

export function TableBackground({ layout, children }: { layout: PokerLayout; children?: React.ReactNode }) {
  const src = tableAssetFor(layout)

  // Preload ONLY the active asset (swaps if the layout bucket changes on resize/rotate).
  useEffect(() => {
    try {
      ReactDOM.preload(src, { as: 'image' })
    } catch {
      /* preload is a hint; safe to ignore where unsupported */
    }
  }, [src])

  return (
    <div className="pk-felt-surface absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover select-none"
        // decorative felt; the green base behind it shows through any letterbox edge
      />
      {/* legibility vignette — darker toward edges, never washing out the centre board */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 42%, transparent 0%, transparent 52%, rgba(7,6,10,0.45) 100%), linear-gradient(180deg, rgba(7,6,10,0.35) 0%, transparent 22%, transparent 70%, rgba(7,6,10,0.55) 100%)',
        }}
      />
      {children}
    </div>
  )
}
