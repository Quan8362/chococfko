'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// ── Constants ─────────────────────────────────────────────────────────────────
const PALETTE = [
  '#e0195a', '#1a8fa6', '#c99a3d', '#e05030', '#2476b8',
  '#27a060', '#7b3fad', '#e8950a', '#148a80', '#c24a00',
  '#5e2d80', '#0e7560', '#b08a00', '#6b3610', '#174e80',
]

const CONFETTI_COLORS = [
  '#c2185b', '#1f8fa6', '#c99a3d', '#e74c3c', '#2980b9',
  '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#ff6b9d',
]

const LS_ENTRIES = 'random-wheel-entries'
const LS_HISTORY = 'random-wheel-history'
const LS_REMOVE  = 'random-wheel-remove-after-pick'

const W       = 320   // SVG viewBox size (internal coordinates)
const CX      = W / 2 // 160
const CY      = W / 2 // 160
const R       = 146   // wheel radius
const SPIN_MS = 4200

// Pointer tip aligns at this % from top of the wheel container.
// = (CY - R) / W * 100 = 14/320 * 100 = 4.375 — correct at ANY display size.
const POINTER_PCT = ((CY - R) / W * 100).toFixed(3)

// ── SVG helpers ───────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toFixed(2)

function buildSlicePath(n: number): string {
  const half = Math.PI / n
  const lx = CX + R * Math.cos(-Math.PI / 2 - half)
  const ly = CY + R * Math.sin(-Math.PI / 2 - half)
  const rx = CX + R * Math.cos(-Math.PI / 2 + half)
  const ry = CY + R * Math.sin(-Math.PI / 2 + half)
  const arc = 360 / n > 180 ? 1 : 0
  return `M ${CX} ${CY} L ${fmt(lx)} ${fmt(ly)} A ${R} ${R} 0 ${arc} 1 ${fmt(rx)} ${fmt(ry)} Z`
}

// ── Wheel SVG component ───────────────────────────────────────────────────────
interface WheelProps { entries: string[]; rotation: number; spinning: boolean }

function WheelSVG({ entries, rotation, spinning }: WheelProps) {
  const n = entries.length

  // Applied to the <svg> element — rotates the whole wheel
  const svgStyle: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: spinning
      ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
      : 'none',
    willChange: 'transform',
    transformOrigin: 'center',
    display: 'block',
    width: '100%',
    height: 'auto',
  }

  if (n === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${W}`} style={svgStyle}>
        {/* Outer shadow ring */}
        <circle cx={CX} cy={CY} r={R + 6} fill="rgba(0,0,0,0.04)" />
        <circle cx={CX} cy={CY} r={R} fill="#ede8e0" stroke="#c8b89a" strokeWidth={3} />
        {/* Center hub */}
        <circle cx={CX} cy={CY} r={28} fill="white" stroke="#ddd" strokeWidth={2} />
        <circle cx={CX} cy={CY} r={16} fill="#c2185b" opacity={0.3} />
        <circle cx={CX} cy={CY} r={6} fill="rgba(255,255,255,0.5)" />
      </svg>
    )
  }

  const segDeg = 360 / n

  // Font size: based on segment count
  const fSize = n <= 3 ? 15.5 : n <= 6 ? 13 : n <= 10 ? 10.5 : n <= 16 ? 9 : 7.5

  // Radial text: starts just outside the hub (r=30), extends toward rim
  const innerTextR = R * 0.26                                                           // ≈38px from center
  const maxLen = Math.max(4, Math.floor((R * 0.87 - innerTextR) / (fSize * 0.60)))

  const slicePath = n > 1 ? buildSlicePath(n) : ''

  return (
    <svg viewBox={`0 0 ${W} ${W}`} style={svgStyle}>
      {/* Subtle outer shadow band */}
      <circle cx={CX} cy={CY} r={R + 5} fill="rgba(0,0,0,0.07)" />

      {n === 1 ? (
        <g>
          <circle cx={CX} cy={CY} r={R} fill={PALETTE[0]} />
          <text
            x={CX} y={CY}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={17} fontWeight="bold" fill="white"
            stroke="rgba(0,0,0,0.18)" strokeWidth={0.7}
            style={{ userSelect: 'none', pointerEvents: 'none', paintOrder: 'stroke' } as React.CSSProperties}
          >
            {entries[0].length > 20 ? entries[0].slice(0, 19) + '…' : entries[0]}
          </text>
        </g>
      ) : (
        entries.map((entry, i) => {
          const midDeg = (i + 0.5) * segDeg
          const label  = entry.length > maxLen ? entry.slice(0, maxLen - 1) + '…' : entry
          return (
            <g key={i} transform={`rotate(${midDeg},${CX},${CY})`}>
              <path d={slicePath} fill={PALETTE[i % PALETTE.length]} stroke="rgba(255,255,255,0.9)" strokeWidth={2} />
              <text
                x={CX}
                y={CY - innerTextR}
                textAnchor="start"
                dominantBaseline="central"
                fontSize={fSize}
                fontWeight="700"
                fill="white"
                stroke="rgba(0,0,0,0.22)"
                strokeWidth={0.55}
                transform={`rotate(-90, ${CX}, ${CY - innerTextR})`}
                style={{ userSelect: 'none', pointerEvents: 'none', paintOrder: 'stroke', fontVariantNumeric: 'lining-nums' } as React.CSSProperties}
              >
                {label}
              </text>
            </g>
          )
        })
      )}

      {/* Outer rim highlight */}
      {n > 1 && (
        <>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={3.5} />
          <circle cx={CX} cy={CY} r={R - 1.5} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={1.5} />
        </>
      )}

      {/* Center hub — sits on top, not affected by segment rotation because it's last */}
      <circle cx={CX} cy={CY} r={30} fill="white" stroke="#dcd2c4" strokeWidth={2.5}
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.12))' } as React.CSSProperties} />
      <circle cx={CX} cy={CY} r={18} fill="#c2185b" />
      <circle cx={CX} cy={CY} r={7} fill="rgba(255,255,255,0.45)" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RandomWheelClient() {
  const t = useTranslations('games.random_wheel')

  const [entries,         setEntries]         = useState<string[]>([])
  const [history,         setHistory]         = useState<string[]>([])
  const [removeAfterPick, setRemoveAfterPick] = useState(true)
  const [inputText,       setInputText]       = useState('')
  const [spinning,        setSpinning]        = useState(false)
  const [rotation,        setRotation]        = useState(0)
  const [winner,          setWinner]          = useState<string | null>(null)
  const [showResult,      setShowResult]      = useState(false)
  const [resultVisible,   setResultVisible]   = useState(false)
  const [copied,          setCopied]          = useState(false)
  const [loaded,          setLoaded]          = useState(false)
  const [spinSnapshot,    setSpinSnapshot]    = useState<string[] | null>(null)
  const [confettiActive,  setConfettiActive]  = useState(false)

  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const confettiRafRef    = useRef<number>(0)
  const confettiStopRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const e = localStorage.getItem(LS_ENTRIES)
      const h = localStorage.getItem(LS_HISTORY)
      const r = localStorage.getItem(LS_REMOVE)
      if (e) setEntries(JSON.parse(e))
      if (h) setHistory(JSON.parse(h))
      if (r !== null) setRemoveAfterPick(JSON.parse(r))
    } catch {}
    setLoaded(true)
  }, [])

  // ── Persist to localStorage ────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(LS_ENTRIES, JSON.stringify(entries)) } catch {}
  }, [entries, loaded])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(history)) } catch {}
  }, [history, loaded])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(LS_REMOVE, JSON.stringify(removeAfterPick)) } catch {}
  }, [removeAfterPick, loaded])

  // ── Animate popup modal in ─────────────────────────────────────────────────
  useEffect(() => {
    if (showResult) {
      requestAnimationFrame(() => setResultVisible(true))
    } else {
      setResultVisible(false)
    }
  }, [showResult])

  // ── Activate confetti when winner popup shows ──────────────────────────────
  useEffect(() => {
    if (showResult && winner) {
      setConfettiActive(true)
    } else {
      setConfettiActive(false)
    }
  }, [showResult, winner])

  // ── Confetti canvas animation ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = confettiCanvasRef.current
    if (!confettiActive || !canvas) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const count = window.innerWidth < 768 ? 80 : 150

    type P = {
      x: number; y: number; vx: number; vy: number
      color: string; w: number; h: number; r: number; dr: number; circle: boolean
    }

    const particles: P[] = Array.from({ length: count }, () => ({
      x:      Math.random() * canvas.width,
      y:      -Math.random() * canvas.height * 0.5 - 10,
      vx:     (Math.random() - 0.5) * 5,
      vy:     Math.random() * 2 + 1.5,
      color:  CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w:      Math.random() * 10 + 5,
      h:      Math.random() * 5 + 3,
      r:      Math.random() * 360,
      dr:     (Math.random() - 0.5) * 7,
      circle: Math.random() > 0.6,
    }))

    let running = true

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.x  += p.vx
        p.y  += p.vy
        p.vy += 0.08
        p.r  += p.dr
        p.vx *= 0.998

        if (p.y > canvas.height + 20) continue

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.r * Math.PI) / 180)
        ctx.fillStyle   = p.color
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (p.y / canvas.height) * 1.3))

        if (p.circle) {
          ctx.beginPath()
          ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }

      confettiRafRef.current = requestAnimationFrame(draw)
    }

    confettiRafRef.current = requestAnimationFrame(draw)

    confettiStopRef.current = setTimeout(() => {
      running = false
      cancelAnimationFrame(confettiRafRef.current)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setConfettiActive(false)
    }, 4500)

    return () => {
      running = false
      cancelAnimationFrame(confettiRafRef.current)
      if (confettiStopRef.current) clearTimeout(confettiStopRef.current)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [confettiActive])

  // ── Entry management ───────────────────────────────────────────────────────
  const addEntries = useCallback(() => {
    const parsed = inputText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!parsed.length) return
    setEntries(prev => {
      const seen = new Set<string>(prev)
      const next = [...prev]
      for (const s of parsed) { if (!seen.has(s)) { seen.add(s); next.push(s) } }
      return next
    })
  }, [inputText])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (!pasted.trim()) return
    const parsed = pasted.split('\n').map(s => s.trim()).filter(Boolean)
    if (!parsed.length) return
    setEntries(prev => {
      const seen = new Set<string>(prev)
      const next = [...prev]
      for (const s of parsed) { if (!seen.has(s)) { seen.add(s); next.push(s) } }
      return next
    })
  }, [])

  const removeEntry = useCallback((idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const clearAll = useCallback(() => {
    setEntries([])
    setSpinSnapshot(null)
    setWinner(null)
    setShowResult(false)
  }, [])

  const shuffleEntries = useCallback(() => {
    setSpinSnapshot(null)
    setEntries(prev => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  // ── Spin logic (UNCHANGED) ─────────────────────────────────────────────────
  const spin = useCallback(() => {
    if (spinning || entries.length === 0) return

    const snap      = [...entries]
    const n         = snap.length
    const winnerIdx = Math.floor(Math.random() * n)
    const picked    = snap[winnerIdx]

    const segDeg     = 360 / n
    const winnerMid  = (winnerIdx + 0.5) * segDeg
    const targetRem  = (360 - winnerMid + 360) % 360
    const currentRem = ((rotation % 360) + 360) % 360
    let extra = (targetRem - currentRem + 360) % 360
    if (extra < 30) extra += 360

    const newRotation = rotation + 5 * 360 + extra

    setSpinSnapshot(snap)
    setSpinning(true)
    setWinner(null)
    setShowResult(false)
    setRotation(newRotation)

    setTimeout(() => {
      setSpinning(false)
      setWinner(picked)
      setShowResult(true)
      setHistory(prev => [picked, ...prev])
      if (removeAfterPick) {
        setEntries(prev => prev.filter(e => e !== picked))
      }
    }, SPIN_MS + 300)
  }, [spinning, entries, rotation, removeAfterPick])

  // ── Copy winner name ───────────────────────────────────────────────────────
  const copyResult = useCallback(() => {
    if (!winner) return
    navigator.clipboard.writeText(winner).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [winner])

  const closeResult = useCallback(() => {
    setShowResult(false)
    setConfettiActive(false)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1080px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Confetti canvas */}
      <canvas
        ref={confettiCanvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 40, display: confettiActive ? 'block' : 'none' }}
      />

      {/* ── Winner popup modal ─────────────────────────────────────────────── */}
      {showResult && winner && (
        <div className="fixed inset-0 flex items-center justify-center px-4" style={{ zIndex: 50 }}>
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300
              ${resultVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeResult}
          />
          <div
            className={`relative bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center w-full max-w-sm
              transition-all duration-500 ${resultVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
          >
            <div className="text-5xl mb-3 select-none leading-none">🎉</div>
            <p className="text-[11px] font-bold uppercase tracking-[3px] text-rose/60 mb-1">
              {t('congrats')}
            </p>
            <p className="text-[12px] text-muted/60 mb-4">{t('result_label')}</p>
            <p className="font-serif font-bold text-[clamp(24px,6vw,36px)] text-ink leading-tight break-words mb-7 px-2">
              {winner}
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={copyResult}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-cream border border-line text-muted hover:text-rose hover:border-rose/30 transition-all"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('copy_result_done')}
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10" />
                    </svg>
                    {t('copy_result')}
                  </>
                )}
              </button>
              <button
                onClick={closeResult}
                className="px-6 py-2.5 rounded-xl bg-rose text-white font-semibold text-[13px] hover:bg-rose-deep transition-all active:scale-95"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb')}
      </Link>

      {/* Header */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,42px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('page_heading')}
        </h1>
        <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
          {t('page_desc')}
        </p>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">

        {/* ── LEFT: Wheel column ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-6 w-full lg:flex-shrink-0 lg:sticky lg:top-[80px]"
          style={{ maxWidth: 'min(520px, 100%)' }}>

          {/* ── Wheel + pointer ─────────────────────────────────────────── */}
          {/*
            Outer wrapper: relative, sets the display size.
            Pointer is positioned using `top: POINTER_PCT%` so the pointer tip
            aligns mathematically with the wheel circle edge at ANY display size.
            POINTER_PCT = (CY-R)/W*100 = 14/320*100 = 4.375
          */}
          <div
            className="relative w-full"
            style={{ maxWidth: 'min(500px, 90vw)' }}
          >
            {/* Pointer triangle — tip stays on wheel edge at any size */}
            <div
              className="absolute left-1/2 z-10 pointer-events-none"
              style={{
                top: `${POINTER_PCT}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <svg
                width="40" height="30" viewBox="0 0 40 30"
                style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.28))' }}
              >
                {/* Pointer body */}
                <polygon
                  points="20,30 2,3 38,3"
                  fill="#c2185b"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {/* Pointer highlight */}
                <polygon
                  points="20,12 10,3 30,3"
                  fill="rgba(255,255,255,0.18)"
                />
              </svg>
            </div>

            {/* Wheel — fills parent width, height auto (square SVG) */}
            <div
              className="rounded-full overflow-hidden"
              style={{
                boxShadow:
                  '0 0 0 6px white, 0 0 0 10px rgba(210,196,178,0.7), 0 16px 64px -12px rgba(0,0,0,0.32)',
              }}
            >
              <WheelSVG
                entries={spinSnapshot ?? entries}
                rotation={rotation}
                spinning={spinning}
              />
            </div>
          </div>

          {/* Spin button */}
          <button
            onClick={spin}
            disabled={spinning || entries.length === 0}
            className={`min-w-[180px] py-3.5 px-10 rounded-2xl font-bold text-[16px] transition-all
              ${spinning || entries.length === 0
                ? 'bg-line/60 text-muted/40 cursor-not-allowed shadow-none'
                : 'bg-rose text-white hover:bg-rose-deep shadow-[0_4px_24px_-4px_rgba(194,24,91,0.5)] hover:shadow-[0_6px_28px_-4px_rgba(194,24,91,0.65)] active:scale-95'
              }`}
          >
            {spinning ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('spinning')}
              </span>
            ) : t('spin_btn')}
          </button>

          {/* Empty hint */}
          {entries.length === 0 && !spinning && (
            <p className="text-[13px] text-muted/55 text-center max-w-[300px] leading-relaxed">
              {t('empty_hint')}
            </p>
          )}

          {/* Entry count badge */}
          {entries.length > 0 && !spinning && (
            <p className="text-[12.5px] text-muted/50 font-medium">
              {entries.length} {t('person_label')}
            </p>
          )}
        </div>

        {/* ── RIGHT: Input + list + history ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">

          {/* Input section */}
          <div className="bg-paper border border-line rounded-2xl p-5 shadow-sm">
            <label className="block text-[11.5px] font-bold uppercase tracking-widest text-ink/50 mb-3">
              {t('input_label')}
              {entries.length > 0 && (
                <span className="ml-2 text-rose font-black normal-case text-[12px]">({entries.length})</span>
              )}
            </label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addEntries() } }}
              placeholder={t('input_placeholder')}
              rows={5}
              className="w-full resize-none rounded-xl border border-line bg-cream/50 px-3.5 py-3 text-[13.5px] text-ink placeholder-muted/40 focus:outline-none focus:ring-2 focus:ring-rose/30 focus:border-rose/40 transition-all leading-relaxed"
            />
            <div className="flex items-center gap-2.5 mt-3">
              <button
                onClick={addEntries}
                disabled={!inputText.trim()}
                className="flex-none py-2.5 px-6 rounded-xl bg-rose text-white text-[13.5px] font-semibold hover:bg-rose-deep transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('add_btn')}
              </button>
              <span className="text-[11px] text-muted/40 hidden sm:block">Ctrl + Enter</span>
            </div>
          </div>

          {/* Remove-after-pick option */}
          <label className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3.5 cursor-pointer hover:border-rose/30 transition-colors group select-none shadow-sm">
            <input
              type="checkbox"
              checked={removeAfterPick}
              onChange={e => setRemoveAfterPick(e.target.checked)}
              className="w-4 h-4 accent-rose rounded cursor-pointer flex-none"
            />
            <span className="text-[13px] text-ink/80 group-hover:text-ink transition-colors">
              {t('remove_after_pick')}
            </span>
          </label>

          {/* Entries list */}
          {entries.length > 0 && (
            <div className="bg-paper border border-line rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11.5px] font-bold uppercase tracking-widest text-ink/50">
                  {entries.length} {t('person_label')}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={shuffleEntries}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-line hover:text-ink transition-all"
                  >
                    🔀 {t('shuffle')}
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-all"
                  >
                    {t('clear_all')}
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-0.5">
                {entries.map((entry, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-cream/70 transition-colors group/row"
                  >
                    <span
                      className="w-5 h-5 rounded-full flex-none flex items-center justify-center text-[9px] font-black text-white shrink-0"
                      style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[13.5px] text-ink truncate">{entry}</span>
                    <button
                      onClick={() => removeEntry(i)}
                      className="opacity-0 group-hover/row:opacity-100 text-[11px] text-muted/40 hover:text-red-500 transition-all flex-none px-1.5 py-0.5 rounded"
                      aria-label={t('remove_entry')}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="bg-paper border border-line rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11.5px] font-bold uppercase tracking-widest text-ink/50">
                  📋 {t('history_heading')}
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-line hover:text-ink transition-all"
                >
                  {t('clear_history')}
                </button>
              </div>
              <ol className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-0.5">
                {history.map((name, i) => (
                  <li key={i} className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg bg-cream/50 text-[13.5px] text-ink">
                    <span className="text-muted/40 text-[11.5px] font-mono w-5 text-right flex-none shrink-0">{i + 1}.</span>
                    <span className="flex-1 truncate">{name}</span>
                    {i === 0 && <span className="text-[14px] flex-none">🏆</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
