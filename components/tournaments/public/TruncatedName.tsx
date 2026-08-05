'use client'

// A name label that stays on ONE line with an ellipsis (so it never widens a bracket card) but still
// lets a viewer read the full name. Three layers, from most to least universal:
//   1. `title` + `aria-label` — always present. `title` is the browser-native tooltip: it is never
//      clipped by an ancestor `overflow:hidden`, works without JS, and is the fallback on touch. The
//      `aria-label` gives assistive tech the complete, untruncated name regardless of visual clipping.
//   2. When the text is actually clipped, the span becomes keyboard-focusable and, on hover OR focus,
//      shows a floating tooltip rendered in a portal on <body> so the bracket's own `overflow` scroll
//      container can never crop it. The tooltip wraps long CJK / Vietnamese names and sits above.
//   3. The floating tip is purely additive — remove JS and layers 1 keeps the name reachable.
//
// Width is fixed by the caller (truncate + min-w-0 flex); this component never changes card width.

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
  const [clipped, setClipped] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const tipId = useId()

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

  const show = useCallback(() => {
    const el = spanRef.current
    if (!el || !clipped) return
    const r = el.getBoundingClientRect()
    setPos({ left: r.left + r.width / 2, top: r.top })
    setOpen(true)
  }, [clipped])

  const hide = useCallback(() => setOpen(false), [])

  // Close the floating tip on scroll/resize (its fixed coordinates would otherwise go stale) and on
  // Escape (dismiss without moving focus away — matches native tooltip expectations).
  useEffect(() => {
    if (!open) return
    const onMove = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <span
        ref={spanRef}
        className={`truncate ${className}`}
        title={name}
        aria-label={name}
        tabIndex={clipped ? 0 : undefined}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {name}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              transform: 'translate(-50%, calc(-100% - 8px))',
              zIndex: 70,
              maxWidth: 'min(80vw, 260px)',
            }}
            className="pointer-events-none rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg whitespace-normal break-words"
          >
            {name}
          </span>,
          document.body,
        )}
    </>
  )
}
