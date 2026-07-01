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

interface Asset {
  readonly src: string
  readonly w: number
  readonly h: number
}
const ASSET: Record<Exclude<PokerLayout, 'portrait'>, Asset> = {
  desktop: { src: '/poker-desktop.webp', w: 1672, h: 941 }, // 16:9
  tablet: { src: '/poker-tablet.webp', w: 1448, h: 1086 }, // 4:3
  mobile: { src: '/poker-mobile.webp', w: 1672, h: 941 }, // 16:9 (landscape-locked)
}

function assetFor(layout: PokerLayout): Asset {
  return ASSET[layout === 'portrait' ? 'mobile' : layout]
}

export function tableAssetFor(layout: PokerLayout): string {
  return assetFor(layout).src
}

// The felt art + all seat/board geometry live in a single "cover box" whose aspect ratio matches
// the chosen asset. `min-width/height: 100%` + `aspect-ratio` makes the box exactly cover the
// viewport (the larger scale wins) while the parent clips the overflow — a manual object-fit:cover.
// Because the geometry `children` are positioned as % of THIS box, every seat pad / card pocket
// stays glued to its feature in the art at any viewport size or aspect ratio (no drift).
export function TableBackground({ layout, children }: { layout: PokerLayout; children?: React.ReactNode }) {
  const asset = assetFor(layout)
  const src = asset.src

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
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          aspectRatio: `${asset.w} / ${asset.h}`,
          minWidth: '100%',
          minHeight: '100%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
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
    </div>
  )
}
