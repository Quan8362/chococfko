'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// ── Constants ─────────────────────────────────────────────────────────────────
const PALETTE = [
  '#c2185b', '#1f8fa6', '#c99a3d', '#e74c3c', '#2980b9',
  '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400',
  '#6c3483', '#117a65', '#b7950b', '#784212', '#1a5276',
]

const LS_ENTRIES = 'random-wheel-entries'
const LS_HISTORY = 'random-wheel-history'
const LS_REMOVE  = 'random-wheel-remove-after-pick'

const W       = 320   // SVG canvas size
const CX      = W / 2 // 160 — centre x
const CY      = W / 2 // 160 — centre y
const R       = 146   // wheel radius
const SPIN_MS = 4200  // animation duration ms

// ── SVG helpers ───────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toFixed(2)

// Returns a symmetric pie-slice path centred at 12 o'clock.
// Each segment group is rotated by (i+0.5)*segAngle to reach its final position.
function buildSlicePath(n: number): string {
  const half = Math.PI / n  // half-angle = 180°/n
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

  const style: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: spinning
      ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
      : 'none',
    willChange: 'transform',
    transformOrigin: 'center',
  }

  // Empty state
  if (n === 0) {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={style}>
        <circle cx={CX} cy={CY} r={R} fill="#ede8e0" stroke="#c8b89a" strokeWidth={3} />
        <circle cx={CX} cy={CY} r={22} fill="white" stroke="#e8ddcf" strokeWidth={2} />
        <circle cx={CX} cy={CY} r={12} fill="#c2185b" opacity={0.35} />
      </svg>
    )
  }

  const segDeg   = 360 / n
  const slicePath = n > 1 ? buildSlicePath(n) : ''
  const fSize    = n <= 4 ? 13 : n <= 8 ? 11 : n <= 15 ? 9 : 8

  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={style}>
      {n === 1 ? (
        // Single entry: full circle
        <g>
          <circle cx={CX} cy={CY} r={R} fill={PALETTE[0]} />
          <text
            x={CX} y={CY}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={14} fontWeight="bold" fill="white"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {entries[0].length > 14 ? entries[0].slice(0, 13) + '…' : entries[0]}
          </text>
        </g>
      ) : (
        entries.map((entry, i) => {
          const midDeg = (i + 0.5) * segDeg
          const label  = entry.length > 10 ? entry.slice(0, 9) + '…' : entry
          return (
            <g key={i} transform={`rotate(${midDeg},${CX},${CY})`}>
              <path d={slicePath} fill={PALETTE[i % PALETTE.length]} stroke="white" strokeWidth={1.5} />
              <text
                x={CX} y={CY - R * 0.62}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={fSize} fontWeight="bold" fill="white"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        })
      )}
      {n > 1 && <circle cx={CX} cy={CY} r={R} fill="none" stroke="white" strokeWidth={2.5} />}
      <circle cx={CX} cy={CY} r={22} fill="white" stroke="#e8ddcf" strokeWidth={2} />
      <circle cx={CX} cy={CY} r={12} fill="#c2185b" />
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

  // ── Animate result card in ─────────────────────────────────────────────────
  useEffect(() => {
    if (showResult) {
      requestAnimationFrame(() => setResultVisible(true))
    } else {
      setResultVisible(false)
    }
  }, [showResult])

  // ── Entry management ───────────────────────────────────────────────────────
  const addEntries = useCallback(() => {
    const parsed = inputText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!parsed.length) return
    // Deduplicate: merge existing + new, keep unique entries (Set preserves insertion order)
    setEntries(prev => [...new Set([...prev, ...parsed])])
    setInputText('')
  }, [inputText])

  const removeEntry = useCallback((idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const clearAll = useCallback(() => {
    setEntries([])
    setWinner(null)
    setShowResult(false)
  }, [])

  const shuffleEntries = useCallback(() => {
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

  // ── Spin logic ─────────────────────────────────────────────────────────────
  // Rotation math:
  // - Segments are drawn centred at top, then each group rotates by midDeg = (i+0.5)*segAngle.
  // - After CSS rotation θ clockwise, the pointer (top) sees the segment whose midpoint
  //   was originally at (360 - θ%360)%360 degrees from top in the SVG local frame.
  // - To land winner at pointer: targetRem = (360 - winnerMid + 360)%360
  const spin = useCallback(() => {
    if (spinning || entries.length === 0) return

    const n         = entries.length
    const winnerIdx = Math.floor(Math.random() * n)
    const picked    = entries[winnerIdx]

    const segDeg    = 360 / n
    const winnerMid = (winnerIdx + 0.5) * segDeg
    const targetRem = (360 - winnerMid + 360) % 360
    const currentRem = ((rotation % 360) + 360) % 360
    let extra = (targetRem - currentRem + 360) % 360
    if (extra < 30) extra += 360  // ensure at least one extra segment of visible spin

    const newRotation = rotation + 5 * 360 + extra

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
        setEntries(prev => prev.filter((_, i) => i !== winnerIdx))
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[980px] mx-auto px-5 sm:px-6 py-10 pb-20">

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
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('badge')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('page_heading')}
        </h1>
        <p className="text-[14.5px] text-muted leading-relaxed max-w-[480px]">
          {t('page_desc')}
        </p>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* ── LEFT: Wheel + result ───────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-5 w-full lg:w-auto lg:sticky lg:top-[80px]">

          {/* Wheel + pointer */}
          <div className="relative inline-flex items-center justify-center">
            {/* Downward-pointing triangle pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[6px] z-10">
              <svg width="28" height="20" viewBox="0 0 28 20">
                <polygon
                  points="14,20 0,0 28,0"
                  fill="#c2185b"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Wheel */}
            <div className="rounded-full shadow-[0_8px_40px_-8px_rgba(0,0,0,0.22)] ring-4 ring-white ring-offset-2 ring-offset-cream overflow-hidden">
              <WheelSVG entries={entries} rotation={rotation} spinning={spinning} />
            </div>
          </div>

          {/* Spin button */}
          <button
            onClick={spin}
            disabled={spinning || entries.length === 0}
            className={`min-w-[160px] py-3 px-8 rounded-2xl font-bold text-[15px] transition-all
              ${spinning || entries.length === 0
                ? 'bg-line/60 text-muted/40 cursor-not-allowed shadow-none'
                : 'bg-rose text-white hover:bg-rose-deep shadow-[0_4px_20px_-4px_rgba(194,24,91,0.5)] hover:shadow-[0_6px_24px_-4px_rgba(194,24,91,0.6)] active:scale-95'
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
            <p className="text-[13px] text-muted/60 text-center max-w-[280px] leading-relaxed">
              {t('empty_hint')}
            </p>
          )}

          {/* Winner result card */}
          {showResult && winner && (
            <div
              className={`w-full max-w-[340px] bg-gradient-to-br from-[#fdeef5] to-cream border-2 border-rose/30 rounded-2xl p-5 text-center shadow-[0_4px_24px_-4px_rgba(194,24,91,0.2)] transition-all duration-500
                ${resultVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
            >
              <p className="text-[10.5px] font-bold uppercase tracking-[2.5px] text-rose/60 mb-2">
                {t('result_label')}
              </p>
              <p className="font-serif font-bold text-[22px] text-ink leading-tight break-words mb-3">
                🎉 {winner}
              </p>
              <button
                onClick={copyResult}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white border border-line text-muted hover:text-rose hover:border-rose/30 transition-all"
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
            </div>
          )}
        </div>

        {/* ── RIGHT: Input + list + history ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">

          {/* Input section */}
          <div className="bg-paper border border-line rounded-2xl p-5">
            <label className="block text-[12px] font-bold uppercase tracking-widest text-ink/60 mb-2.5">
              {t('input_label')}
              {entries.length > 0 && (
                <span className="ml-2 text-rose font-black">({entries.length})</span>
              )}
            </label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addEntries() } }}
              placeholder={t('input_placeholder')}
              rows={5}
              className="w-full resize-none rounded-xl border border-line bg-cream/50 px-3.5 py-3 text-[13.5px] text-ink placeholder-muted/40 focus:outline-none focus:ring-2 focus:ring-rose/30 focus:border-rose/40 transition-all leading-relaxed"
            />
            <div className="flex items-center gap-2.5 mt-2.5">
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
          <label className="flex items-center gap-3 bg-paper border border-line rounded-xl px-4 py-3 cursor-pointer hover:border-rose/30 transition-colors group select-none">
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
            <div className="bg-paper border border-line rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[12px] font-bold uppercase tracking-widest text-ink/60">
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
              <ul className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-0.5">
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
            <div className="bg-paper border border-line rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-[12px] font-bold uppercase tracking-widest text-ink/60">
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
