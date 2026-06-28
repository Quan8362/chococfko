'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { ReactionControl, PhraseBubbleLayer, ThrowableLayer, OpponentMenu, ReportDialog } from '../[roomCode]/TlmnInteractions'
import type { ReportReason } from '@/lib/games/tlmn/interactions'
import { THROWABLES, getThrowable } from '@/lib/games/tlmn/interactions'
import type { Throw, Bubble } from '../[roomCode]/useTlmnInteractions'

// Representative seat geometry mirroring TlmnTable's desktop GEOMETRY anchors (avatar-centre
// %s). Seat indices: 0 = me (bottom), 1 = right, 2 = top, 3 = left — a real 4-seat layout.
const ANCHORS: Record<number, { x: number; y: number }> = {
  0: { x: 50, y: 86 }, // bottom (me)
  1: { x: 91, y: 47 }, // right
  2: { x: 50, y: 15 }, // top
  3: { x: 9, y: 47 },  // left
}
const PLACE: Record<number, string> = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' }
const SEAT_NAME: Record<number, string> = {
  0: 'You', 1: 'Nguyễn Văn A Long Name', 2: 'Bot 2', 3: '李明字号超长名字测试',
}

// Trajectory cases the spec enumerates (criterion 12).
const TRAJ: { id: string; from: number; to: number }[] = [
  { id: 'top-left', from: 2, to: 3 },
  { id: 'top-right', from: 2, to: 1 },
  { id: 'left-right', from: 3, to: 1 },
  { id: 'right-left', from: 1, to: 3 },
  { id: 'bottom-top', from: 0, to: 2 },
  { id: 'bottom-left', from: 0, to: 3 },
  { id: 'bottom-right', from: 0, to: 1 },
]

let seq = 0

export default function FxVerifyClient() {
  const t = useTranslations('games.tlmn')
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [throws, setThrows] = useState<Throw[]>([])
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [targetingKey, setTargetingKey] = useState<string | null>(null)
  const [reduced, setReduced] = useState(false)
  // Phase 4 harness state.
  const [menuSeat, setMenuSeat] = useState<number | null>(null)
  const [reportSeat, setReportSeat] = useState<number | null>(null)
  const [pmuted, setPmuted] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(e => { const r = e[0].contentRect; setBox({ w: r.width, h: r.height }) })
    ro.observe(el)
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!targetingKey) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTargetingKey(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [targetingKey])

  const coordOf = (seat: number) => {
    const a = ANCHORS[seat] ?? ANCHORS[2]
    return { x: (a.x / 100) * box.w, y: (a.y / 100) * box.h }
  }
  const anchorStyle = (seat: number): CSSProperties => {
    const a = ANCHORS[seat] ?? ANCHORS[2]
    return { left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%, -50%)' }
  }
  const placeOf = (seat: number) => PLACE[seat] ?? 'top'

  const addThrow = (key: string, from: number, to: number) => {
    const id = `t${++seq}`
    setThrows(prev => [...prev, { id, key, fromSeat: from, toSeat: to, nonce: seq }].slice(-3))
    setTimeout(() => setThrows(prev => prev.filter(x => x.id !== id)), 1400)
  }
  const showBubble = () => {
    setBubbles([{ seat: 0, phraseKey: 'hello', emoji: '👋', nonce: ++seq }])
    setTimeout(() => setBubbles([]), 3200)
  }
  const orderedOthers = [1, 2, 3]

  return (
    <div data-fxverify className="fixed inset-0 z-[300] bg-[#0c2a1c] overflow-hidden">
      {/* The "board" box — seats + overlays positioned by % like the real felt. */}
      <div ref={boxRef} className="absolute inset-0">
        {/* Seat avatars (so impacts/bubbles have something to land on) */}
        {[0, 1, 2, 3].map(seat => (
          <div key={seat} className="absolute z-10" style={anchorStyle(seat)}>
            <div className="flex flex-col items-center gap-0.5" style={{ transform: 'translate(-50%,-50%)', position: 'absolute' }}>
              <div className="w-12 h-12 rounded-full bg-rose/30 ring-2 ring-white/40 flex items-center justify-center text-white text-[18px] font-bold">
                {SEAT_NAME[seat][0]}
              </div>
              <span className="text-[10px] text-white/85 font-semibold max-w-[90px] truncate bg-black/40 px-1.5 rounded" data-seat-name={seat}>
                {SEAT_NAME[seat]}
              </span>
            </div>
          </div>
        ))}

        {/* REAL components under test */}
        <PhraseBubbleLayer bubbles={bubbles} anchorStyle={anchorStyle} placeOf={placeOf} t={t} />
        <ThrowableLayer throws={throws} coordOf={coordOf} reduced={reduced} />

        {/* Phase 4: opponent menu + report dialog (real components) */}
        {menuSeat != null && (
          <OpponentMenu
            style={anchorStyle(menuSeat)}
            name={SEAT_NAME[menuSeat]}
            muted={pmuted}
            onMute={() => { setPmuted(v => !v); setMenuSeat(null) }}
            onReport={() => { const s = menuSeat; setMenuSeat(null); setReportSeat(s) }}
            onClose={() => setMenuSeat(null)}
            t={t}
          />
        )}
        {reportSeat != null && (
          <ReportDialog
            name={SEAT_NAME[reportSeat]}
            onSubmit={(_r: ReportReason) => { setReportSeat(null); setReportSent(true); setTimeout(() => setReportSent(false), 1500) }}
            onClose={() => setReportSeat(null)}
            t={t}
          />
        )}
        {reportSent && <div data-testid="report-sent" className="absolute left-1/2 top-1/2 z-[90] text-white">sent</div>}

        {/* Target-selection overlay (mirrors TlmnTable) */}
        {targetingKey && (
          <>
            <button type="button" data-testid="target-backdrop" aria-label={t('react_cancel')} onClick={() => setTargetingKey(null)} className="absolute inset-0 z-[56] bg-black/45 backdrop-blur-[1px] cursor-pointer" />
            <div className="absolute left-1/2 -translate-x-1/2 z-[59] flex items-center gap-2" style={{ top: '5%' }}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-1.5 text-[12px] font-bold text-ink shadow-lg">
                <span aria-hidden>{getThrowable(targetingKey)?.emoji}</span>{t('react_pick_target')}
              </span>
              <button type="button" data-testid="target-cancel" onClick={() => setTargetingKey(null)} className="rounded-full bg-rose text-white px-3.5 py-1.5 text-[12px] font-bold">{t('react_cancel')}</button>
            </div>
            {orderedOthers.map(idx => (
              <button
                key={idx}
                type="button"
                data-testid={`target-${idx}`}
                onClick={e => { e.stopPropagation(); addThrow(targetingKey, 0, idx); setTargetingKey(null) }}
                aria-label={t('react_send_item_to', { item: t(`react_item_${targetingKey}` as Parameters<typeof t>[0]), name: SEAT_NAME[idx] })}
                className="tlmn-target-pick absolute z-[58]"
                style={anchorStyle(idx)}
              >
                <span className="tlmn-target-ring" aria-hidden />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Mock control bar — verifies the overlay (pointer-events:none) never blocks gameplay
          controls. Each click bumps a counter Playwright reads. */}
      <MockControls />

      {/* Test driver controls (fixed, high z). */}
      <div className="fixed top-2 left-2 z-[200] flex flex-wrap gap-1 max-w-[60vw]">
        {THROWABLES.map(it => (
          <button key={it.key} type="button" data-testid={`throw-${it.key}`} onClick={() => addThrow(it.key, 0, 2)} className="bg-white/90 text-black text-[11px] px-1.5 py-0.5 rounded">{it.emoji}{it.key}</button>
        ))}
        {TRAJ.map(tr => (
          <button key={tr.id} type="button" data-testid={`traj-${tr.id}`} onClick={() => addThrow('flower', tr.from, tr.to)} className="bg-amber-200 text-black text-[11px] px-1.5 py-0.5 rounded">{tr.id}</button>
        ))}
        <button type="button" data-testid="show-bubble" onClick={showBubble} className="bg-emerald-200 text-black text-[11px] px-1.5 py-0.5 rounded">bubble</button>
        <button type="button" data-testid="arm-target" onClick={() => setTargetingKey('bomb')} className="bg-cyan-200 text-black text-[11px] px-1.5 py-0.5 rounded">arm-target</button>
        <button type="button" data-testid="open-menu" onClick={() => setMenuSeat(2)} className="bg-orange-200 text-black text-[11px] px-1.5 py-0.5 rounded">open-menu</button>
        <button type="button" data-testid="burst-3" onClick={() => { addThrow('bomb', 1, 0); addThrow('tomato', 2, 0); addThrow('egg', 3, 0); addThrow('flower', 1, 2) }} className="bg-fuchsia-200 text-black text-[11px] px-1.5 py-0.5 rounded">burst4</button>
      </div>

      {/* The REAL ReactionControl (chrome button + panel) in a chrome-like top-right cluster. */}
      <div className="fixed top-2 right-2 z-[200] flex items-center gap-2 bg-black/40 p-1 rounded-xl">
        <button type="button" data-testid="mock-sort2" className="tlmn-chrome">S</button>
        <ReactionControl t={t} sendPhrase={() => 'ok'} onPickThrowable={key => setTargetingKey(key)} catalog={new Map()} muted={false} onToggleMuted={() => {}} />
        <span data-testid="throw-count" className="text-white text-[10px]">{throws.length}</span>
      </div>
    </div>
  )
}

function MockControls() {
  const [hits, setHits] = useState(0)
  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-2">
      {['sort', 'play', 'pass', 'sound', 'fullscreen', 'exit'].map(c => (
        <button key={c} type="button" data-testid={`ctrl-${c}`} onClick={() => setHits(h => h + 1)} className="bg-rose text-white text-[12px] font-bold px-3 py-2 rounded-lg">{c}</button>
      ))}
      <span data-testid="ctrl-hits" className="text-white text-[12px]">{hits}</span>
    </div>
  )
}
