'use client'

import { useCallback, useEffect, useRef } from 'react'

export interface WritingCanvasApi {
  undo: () => void
  clear: () => void
  isEmpty: () => boolean
}

interface Point {
  x: number
  y: number
  w: number
}

interface WritingCanvasProps {
  /** Square pixel size of the cell. */
  size: number
  /** Kanji shown as a faint guide to trace over (when `trace` is true). */
  char: string
  /** Show the faded glyph behind the writing surface. */
  trace?: boolean
  /** Draw the 米字格 dashed guide lines. */
  guide?: boolean
  /** Ink color. */
  strokeColor?: string
  /** Called once after mount with stable imperative handles. */
  onReady?: (api: WritingCanvasApi) => void
  /** Called when a stroke finishes; passes this canvas' api for global undo ordering. */
  onStrokeEnd?: (api: WritingCanvasApi) => void
  /** Called when a pointer begins drawing here (used to suppress page-swipe). */
  onDrawStart?: () => void
  /** Incremented by a parent to clear this canvas (page-level "clear all"). */
  clearSignal?: number
  className?: string
}

const GUIDE = '#e3d5c4'

export default function WritingCanvas({
  size,
  char,
  trace = false,
  guide = true,
  strokeColor = '#241a17',
  onReady,
  onStrokeEnd,
  onDrawStart,
  clearSignal = 0,
  className = '',
}: WritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Point[][]>([])
  const currentRef = useRef<Point[] | null>(null)
  const drawingRef = useRef(false)

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null

  const redraw = useCallback(() => {
    const ctx = getCtx()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = strokeColor
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) {
        // a dot
        if (stroke.length === 1) {
          const p = stroke[0]
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2)
          ctx.fillStyle = strokeColor
          ctx.fill()
        }
        continue
      }
      for (let i = 1; i < stroke.length; i++) {
        ctx.beginPath()
        ctx.lineWidth = stroke[i].w
        ctx.moveTo(stroke[i - 1].x, stroke[i - 1].y)
        ctx.lineTo(stroke[i].x, stroke[i].y)
        ctx.stroke()
      }
    }
  }, [strokeColor])

  // Size the backing store to the device pixel ratio for crisp ink.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    redraw()
  }, [size, redraw])

  // Stable imperative api.
  useEffect(() => {
    if (!onReady) return
    onReady({
      undo: () => {
        strokesRef.current.pop()
        redraw()
      },
      clear: () => {
        strokesRef.current = []
        redraw()
      },
      isEmpty: () => strokesRef.current.length === 0,
    })
    // onReady is intentionally only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Page-level "clear all": clear when the signal changes (skip first render).
  const firstClearRef = useRef(true)
  useEffect(() => {
    if (firstClearRef.current) { firstClearRef.current = false; return }
    strokesRef.current = []
    redraw()
  }, [clearSignal, redraw])

  const apiRef = useRef<WritingCanvasApi>({
    undo: () => { strokesRef.current.pop(); redraw() },
    clear: () => { strokesRef.current = []; redraw() },
    isEmpty: () => strokesRef.current.length === 0,
  })
  apiRef.current.undo = () => { strokesRef.current.pop(); redraw() }
  apiRef.current.clear = () => { strokesRef.current = []; redraw() }
  apiRef.current.isEmpty = () => strokesRef.current.length === 0

  const pointFromEvent = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const pressure = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5
    const base = Math.max(2, size * 0.055)
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: base * (0.6 + pressure),
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    onDrawStart?.()
    drawingRef.current = true
    try { canvasRef.current?.setPointerCapture(e.pointerId) } catch { /* noop */ }
    const p = pointFromEvent(e)
    currentRef.current = [p]
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !currentRef.current) return
    e.stopPropagation()
    const p = pointFromEvent(e)
    const stroke = currentRef.current
    const prev = stroke[stroke.length - 1]
    stroke.push(p)
    const ctx = getCtx()
    if (ctx && prev) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = strokeColor
      ctx.beginPath()
      ctx.lineWidth = p.w
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }

  const endStroke = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const stroke = currentRef.current
    currentRef.current = null
    try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    if (stroke && stroke.length > 0) {
      strokesRef.current.push(stroke)
      redraw() // normalize the freshly drawn stroke (dot handling)
      onStrokeEnd?.(apiRef.current)
    }
  }

  return (
    <div
      className={`relative shrink-0 rounded-md border border-line bg-paper overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 米字格 guide */}
      {guide && (
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <line x1="50" y1="0" x2="50" y2="100" stroke={GUIDE} strokeWidth="0.7" strokeDasharray="4 3" />
          <line x1="0" y1="50" x2="100" y2="50" stroke={GUIDE} strokeWidth="0.7" strokeDasharray="4 3" />
          <line x1="0" y1="0" x2="100" y2="100" stroke={GUIDE} strokeWidth="0.5" strokeDasharray="3 4" />
          <line x1="100" y1="0" x2="0" y2="100" stroke={GUIDE} strokeWidth="0.5" strokeDasharray="3 4" />
        </svg>
      )}

      {/* Faded glyph to trace */}
      {trace && (
        <span
          lang="ja"
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-bold leading-none select-none pointer-events-none text-ink/15"
          style={{ fontSize: size * 0.78, fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
        >
          {char}
        </span>
      )}

      <canvas
        ref={canvasRef}
        data-draw
        className="absolute inset-0 w-full h-full"
        style={{ width: size, height: size, touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
    </div>
  )
}
