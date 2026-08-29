'use client'

// A name label that stays on ONE line with an ellipsis (so it never widens its card) but still lets a
// viewer read the full name on demand. Layered from most to least universal:
//   1. `title` + `aria-label` — always present. `title` is the browser-native tooltip: it is never
//      clipped by an ancestor `overflow:hidden`, works without JS, and is the last-resort touch fallback.
//      `aria-label` hands assistive tech the complete, untruncated name regardless of visual clipping.
//   2. When the text is actually clipped, the span becomes keyboard-focusable and reveals a floating
//      tooltip — on HOVER (fine pointer, short intent-delay), on TAP (touch / pen), and on keyboard
//      FOCUS. It renders in a portal on <body> so an ancestor `overflow` scroll container can never crop
//      it, is positioned against the trigger (centred + clamped to the viewport, flips above↔below), and
//      wraps long CJK / Vietnamese names instead of truncating a second time.
//   3. The floating tip is purely additive — remove JS and layer 1 keeps the name reachable.
//
// A real phone has no hover, so a plain TAP opens the tip; a second tap, a tap elsewhere, Escape or a
// scroll closes it, and tapping another name hands the tip over. That mobile path is why native `title`
// alone is not enough. Width is fixed by the caller (truncate + min-w-0 flex): this component never
// changes card width, and the tip is `pointer-events-none` so it can never steal a tap from a button.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function TruncatedName({
  name,
  className = '',
}: {
  name: string
  className?: string
}) {
  const spanRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const [clipped, setClipped] = useState(false)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const tipId = useId()

  // The last press's pointer kind. A `click` event carries no pointerType, so we remember it to tell a
  // finger/pen TAP (which toggles the tip) from a mouse click (hover already owns the mouse).
  const pointerKind = useRef<string>('mouse')
  const hoverTimer = useRef<number | null>(null)
  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  // Overflow detection: the single-line span is clipped when its content is wider than its box.
  const measure = useCallback(() => {
    const el = spanRef.current
    if (!el) return
    setClipped(el.scrollWidth > el.clientWidth + 1)
  }, [])

  useLayoutEffect(() => {
    measure()
    const el = spanRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, name])

  // Canonical opener (keyboard focus + tap). Captures the trigger rect for the portalled tip to anchor
  // against. Only a genuinely clipped name opens — a name that already fits needs no tip and no tab stop.
  const show = useCallback(() => {
    const el = spanRef.current
    if (!el || !clipped) return
    clearHoverTimer()
    setAnchor(el.getBoundingClientRect())
    setOpen(true)
  }, [clipped])

  const hide = useCallback(() => {
    clearHoverTimer()
    setOpen(false)
  }, [])

  // Hover adds a short intent-delay over `show` so sweeping the pointer across a list doesn't flash a
  // tip on every name in passing.
  const showHover = useCallback(() => {
    if (!clipped) return
    clearHoverTimer()
    hoverTimer.current = window.setTimeout(show, 160)
  }, [clipped, show])

  // A finger/pen tap toggles the tip; a mouse click is deliberately ignored (hover already reveals it,
  // and toggling on click would blink it shut under the cursor).
  const onClickTrigger = useCallback(() => {
    if (pointerKind.current === 'mouse' || !clipped) return
    if (open) hide()
    else show()
  }, [clipped, open, show, hide])

  // Position the portalled tip against the trigger: centre horizontally (clamped inside the viewport),
  // prefer above and flip below when there isn't room. Measured in a layout effect so it paints in the
  // right place on the first frame (no flash), and re-clamped if the tip's own wrapped size changes.
  useLayoutEffect(() => {
    if (!open || !anchor) {
      setCoords(null)
      return
    }
    const tip = tipRef.current
    if (!tip) return
    const margin = 8
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    let left = anchor.left + anchor.width / 2 - tw / 2
    left = Math.max(margin, Math.min(left, vw - tw - margin))
    let top = anchor.top - th - margin
    if (top < margin) top = anchor.bottom + margin // not enough room above → flip below
    if (top + th > vh - margin) top = Math.max(margin, vh - th - margin)
    setCoords({ left, top })
  }, [open, anchor, name])

  // While open: close on scroll/resize (the fixed coords would otherwise go stale), on Escape (native
  // tooltip expectation — dismiss without moving focus), and on any press outside the trigger (tap-away
  // and switching to another name on touch, where there is no blur to rely on).
  useEffect(() => {
    if (!open) return
    const onMove = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDocDown = (e: PointerEvent) => {
      if (spanRef.current && !spanRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDocDown, true)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDocDown, true)
    }
  }, [open])

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <>
      <span
        ref={spanRef}
        className={`truncate ${className}`}
        title={name}
        aria-label={name}
        tabIndex={clipped ? 0 : undefined}
        aria-describedby={open ? tipId : undefined}
        onPointerDown={(e) => {
          pointerKind.current = e.pointerType
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') showHover()
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') hide()
        }}
        onClick={onClickTrigger}
        onFocus={show}
        onBlur={hide}
      >
        {name}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{
              position: 'fixed',
              left: coords?.left ?? -9999,
              top: coords?.top ?? -9999,
              zIndex: 70,
              maxWidth: 'min(320px, calc(100vw - 32px))',
              visibility: coords ? 'visible' : 'hidden',
            }}
            className="pointer-events-none rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink shadow-[0_10px_30px_-8px_rgba(60,42,28,0.28)] whitespace-normal break-words"
          >
            {name}
          </span>,
          document.body,
        )}
    </>
  )
}
