'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Point = [number, number]
type Stroke = Point[]

interface Candidate {
  character: string
  confidence?: number
  reading?: string
  meaning_vi?: string
  meaning_en?: string
  jlpt?: string
  url: string
}

interface Props {
  /** Called when a candidate is chosen. If omitted, navigates to dictionary search. */
  onPick?: (character: string) => void
  /** Logical canvas size in px (square). */
  size?: number
}

const JLPT_COLORS: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-800',
  N4: 'bg-blue-100 text-blue-800',
  N3: 'bg-amber-100 text-amber-800',
  N2: 'bg-orange-100 text-orange-800',
  N1: 'bg-red-100 text-red-800',
}

export default function HandwritingCanvas({ onPick, size = 300 }: Props) {
  const t = useTranslations('japanese')
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef(false)

  const [hasInk, setHasInk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [status, setStatus] = useState<'idle' | 'empty' | 'unavailable' | 'error'>('idle')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size, size)
    // Center guide lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2)
    ctx.stroke()
    // Ink
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0][0], stroke[0][1])
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i][0], stroke[i][1])
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] + 0.1, stroke[0][1] + 0.1)
      ctx.stroke()
    }
  }, [size])

  useEffect(() => { redraw() }, [redraw])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * size
    const y = ((e.clientY - rect.top) / rect.height) * size
    return [Math.max(0, Math.min(size, x)), Math.max(0, Math.min(size, y))]
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawingRef.current = true
    strokesRef.current.push([pointFromEvent(e)])
    setHasInk(true)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    e.preventDefault()
    const stroke = strokesRef.current[strokesRef.current.length - 1]
    if (stroke) {
      stroke.push(pointFromEvent(e))
      redraw()
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    drawingRef.current = false
    try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function clearAll() {
    strokesRef.current = []
    setHasInk(false)
    setCandidates([])
    setStatus('idle')
    redraw()
  }

  function undo() {
    strokesRef.current.pop()
    setHasInk(strokesRef.current.length > 0)
    redraw()
  }

  async function recognize() {
    if (strokesRef.current.length === 0) return
    setLoading(true)
    setStatus('idle')
    setCandidates([])
    try {
      const res = await fetch('/api/japanese/handwriting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strokes: strokesRef.current, width: size, height: size }),
      })
      const data = await res.json()
      if (data.configured === false) {
        setStatus('unavailable')
      } else if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        setCandidates(data.candidates)
      } else if (data.error) {
        setStatus('error')
      } else {
        setStatus('empty')
      }
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  function pick(c: Candidate) {
    if (onPick) onPick(c.character)
    else router.push(c.url)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">{t('hw_instructions')}</p>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Drawing surface */}
        <div className="shrink-0">
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            role="img"
            aria-label={t('hw_canvas_label')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="touch-none select-none w-full max-w-[300px] sm:w-[300px] aspect-square rounded-2xl border-2 border-dashed border-line bg-cream/40 cursor-crosshair"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={recognize}
              disabled={!hasInk || loading}
              className="inline-flex items-center gap-1.5 bg-rose text-white font-semibold text-[13.5px] px-4 py-2 rounded-full hover:bg-rose-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('hw_recognizing') : t('hw_recognize')}
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!hasInk || loading}
              className="inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2 rounded-full border border-line hover:border-rose/40 hover:text-rose transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('hw_undo')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={!hasInk || loading}
              className="inline-flex items-center gap-1.5 bg-white text-ink font-semibold text-[13.5px] px-4 py-2 rounded-full border border-line hover:border-rose/40 hover:text-rose transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('hw_clear')}
            </button>
          </div>
        </div>

        {/* Candidates */}
        <div className="flex-1 min-w-0" aria-live="polite">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2.5">
            {t('hw_candidates')}
          </p>

          {status === 'unavailable' && (
            <p className="text-[13px] text-muted bg-cream border border-line rounded-xl p-3">
              {t('hw_unavailable')}
            </p>
          )}
          {status === 'error' && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {t('hw_error')}
            </p>
          )}
          {status === 'empty' && (
            <p className="text-[13px] text-muted">{t('hw_no_candidates')}</p>
          )}
          {status === 'idle' && candidates.length === 0 && !loading && (
            <p className="text-[13px] text-muted/70">{t('hw_hint')}</p>
          )}

          {candidates.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {candidates.map((c, i) => (
                <li key={`${c.character}-${i}`}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="group w-full flex items-center gap-2.5 text-left bg-paper border border-line rounded-xl p-2.5 hover:border-rose/40 hover:bg-rose-soft/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                  >
                    <span lang="ja" className="font-serif text-[26px] leading-none text-ink group-hover:text-rose transition-colors">
                      {c.character}
                    </span>
                    <span className="min-w-0">
                      {c.reading && (
                        <span lang="ja" className="block text-[11.5px] text-muted truncate">{c.reading}</span>
                      )}
                      {c.meaning_vi && (
                        <span className="block text-[11.5px] text-ink/80 truncate">{c.meaning_vi}</span>
                      )}
                      {c.jlpt && (
                        <span className={`inline-block mt-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${JLPT_COLORS[c.jlpt] ?? 'bg-line text-muted'}`}>
                          {c.jlpt}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
