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
const LS_SOUND   = 'random-wheel-sound'

const W       = 320   // SVG viewBox size (internal coordinates)
const CX      = W / 2 // 160
const CY      = W / 2 // 160
const R       = 146   // wheel radius

// ── Fine-tune knobs (edit here) ────────────────────────────────────────────────
// Spin lasts SPIN_MS and decelerates on SPIN_EASING — an ease-out with a long,
// slow tail so the last 2–3s crawl past the segments and build suspense. It must
// NOT change the outcome: the winner is still picked uniformly at random, we only
// animate the wheel toward it.
const SPIN_MS     = 10000                              // ~10s spin
const SPIN_EASING = 'cubic-bezier(0.16, 1, 0.2, 1)'    // easeOutQuint-ish: fast start, long glide to stop

// Winner celebration: applause + crowd-cheer clip, fired the moment the wheel stops.
// Source: Wikimedia Commons "277021_sandermotions_applause-2.wav" — CC0 (public domain).
const CELEBRATION_SRC     = '/applause-cheer.wav'
const CELEBRATION_MS      = 7000                       // play up to ~7s then stop (clip is ~6.3s)
const CELEBRATION_FADE_MS = 800                        // fade-out length so it doesn't cut abruptly
const CELEBRATION_VOLUME  = 0.9

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
interface WheelProps {
  entries: string[]
  rotation: number
  spinning: boolean
  hovered?: number | null
  onHover?: (i: number | null) => void
  svgRef?: React.Ref<SVGSVGElement>
}

function WheelSVG({ entries, rotation, spinning, hovered = null, onHover, svgRef }: WheelProps) {
  const n = entries.length

  // Applied to the <svg> element — rotates the whole wheel
  const svgStyle: React.CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: spinning
      ? `transform ${SPIN_MS}ms ${SPIN_EASING}`
      : 'none',
    willChange: 'transform',
    transformOrigin: 'center',
    display: 'block',
    width: '100%',
    height: 'auto',
  }

  if (n === 0) {
    return (
      <svg ref={svgRef} viewBox={`0 0 ${W} ${W}`} style={svgStyle}>
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
  const fSize = n <= 3 ? 20 : n <= 6 ? 17 : n <= 10 ? 14 : n <= 16 ? 12 : 9.5

  // Radial text: anchor at geometric center of visible segment zone = (hub_r + R) / 2 ≈ 88px
  const midTextR = R * 0.60                                                             // ≈88px from center
  const maxLen = Math.max(5, Math.floor(2 * (R * 0.91 - midTextR) / (fSize * 0.55)))

  const slicePath = n > 1 ? buildSlicePath(n) : ''

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${W}`} style={svgStyle}>
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
          const norm   = ((midDeg % 360) + 360) % 360
          // Radial labels are only upright for the right half (midDeg 0–180°). On
          // the bottom-left → upper-left half (180–360°) the baseline points down,
          // so the text renders upside-down — add 180° (use +90) to flip it back.
          const flip    = norm > 180
          const textRot = flip ? 90 : -90
          const label   = entry.length > maxLen ? entry.slice(0, maxLen - 1) + '…' : entry
          const isHot   = hovered === i
          return (
            <g key={i} transform={`rotate(${midDeg},${CX},${CY})`}>
              <path
                d={slicePath}
                fill={PALETTE[i % PALETTE.length]}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
                onMouseEnter={onHover ? () => onHover(i) : undefined}
                onMouseLeave={onHover ? () => onHover(null) : undefined}
                style={{ filter: isHot ? 'brightness(1.12)' : undefined, transition: 'filter 150ms ease' } as React.CSSProperties}
              />
              {isHot && (
                <path d={slicePath} fill="none" stroke="white" strokeWidth={3} opacity={0.9} pointerEvents="none" />
              )}
              <text
                x={CX}
                y={CY - midTextR}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fSize}
                fontWeight="700"
                fill="white"
                stroke="rgba(0,0,0,0.34)"
                strokeWidth={0.9}
                transform={`rotate(${textRot}, ${CX}, ${CY - midTextR})`}
                style={{ userSelect: 'none', pointerEvents: 'none', paintOrder: 'stroke', fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' } as React.CSSProperties}
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
  const [hovered,         setHovered]         = useState<number | null>(null)
  const [soundOn,         setSoundOn]         = useState(false)

  const confettiCanvasRef     = useRef<HTMLCanvasElement | null>(null)
  const confettiRafRef        = useRef<number>(0)
  const confettiStopRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confettiIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const reducedRef            = useRef(false)
  const soundOnRef            = useRef(false)
  const audioCtxRef           = useRef<AudioContext | null>(null)
  const tickRafRef            = useRef<number>(0)
  const wheelSvgRef           = useRef<SVGSVGElement | null>(null)
  const celebrationAudioRef   = useRef<HTMLAudioElement | null>(null)
  const celebrationPrimedRef  = useRef(false)
  const celebrationStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const celebrationFadeRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Honour prefers-reduced-motion (skip confetti, no tick scheduling) ──────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // ── Create / resume the AudioContext (MUST run inside a user gesture for iOS) ─
  const ensureAudio = useCallback((): AudioContext | null => {
    try {
      let ctx = audioCtxRef.current
      if (!ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        ctx = new Ctor()
        audioCtxRef.current = ctx
      }
      if (ctx.state === 'suspended') ctx.resume()
      return ctx
    } catch { return null }
  }, [])

  // ── A single peg "tick" (synthesised square blip; very short, very quiet) ──
  // `progress` = 1 at spin start → 0 at stop. Ticks are denser when fast, so we
  // pitch them higher AND keep them quieter early to avoid a harsh machine-gun.
  const playTick = useCallback((progress: number) => {
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state !== 'running') return
    try {
      const now  = ctx.currentTime
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 360 + progress * 520        // higher pitch early, lower as it slows
      const peak = 0.05 - progress * 0.034              // ≈0.016 when dense → 0.05 near the stop
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.06)
      osc.onended = () => { try { osc.disconnect(); gain.disconnect() } catch {} }
    } catch {}
  }, [])

  // ── Stop any in-flight celebration playback / timers ───────────────────────
  const clearCelebration = useCallback(() => {
    if (celebrationStopRef.current) { clearTimeout(celebrationStopRef.current); celebrationStopRef.current = null }
    if (celebrationFadeRef.current) { clearInterval(celebrationFadeRef.current); celebrationFadeRef.current = null }
    const el = celebrationAudioRef.current
    if (el) { try { el.pause(); el.currentTime = 0 } catch {} }
  }, [])

  // ── Prime the <audio> element inside the user gesture (iOS/Android unlock) ──
  // A muted play()/pause() during the tap satisfies mobile autoplay policies so a
  // later programmatic play() (when the wheel stops) is allowed to make sound.
  const primeCelebration = useCallback(() => {
    const el = celebrationAudioRef.current
    if (!el || celebrationPrimedRef.current) return
    try {
      el.muted = true
      const p = el.play()
      if (p) p.then(() => {
        try { el.pause(); el.currentTime = 0 } catch {}
        el.muted = false
        celebrationPrimedRef.current = true
      }).catch(() => { el.muted = false })
    } catch {}
  }, [])

  // ── Winner celebration: applause + crowd cheer, trimmed to ~CELEBRATION_MS ──
  // with a fade-out tail. Fires the moment the wheel stops; respects sound toggle.
  const playCelebration = useCallback(() => {
    const el = celebrationAudioRef.current
    if (!el) return
    clearCelebration()
    try {
      el.currentTime = 0
      el.volume = CELEBRATION_VOLUME
      const p = el.play()
      if (p) p.catch(() => {})

      const durMs   = el.duration && isFinite(el.duration) ? el.duration * 1000 : CELEBRATION_MS
      const endAt   = Math.min(CELEBRATION_MS, durMs)
      const fadeAt  = Math.max(0, endAt - CELEBRATION_FADE_MS)

      celebrationStopRef.current = setTimeout(() => {
        const startVol = el.volume
        const steps    = 16
        let   i        = 0
        celebrationFadeRef.current = setInterval(() => {
          i++
          try { el.volume = Math.max(0, startVol * (1 - i / steps)) } catch {}
          if (i >= steps) {
            if (celebrationFadeRef.current) { clearInterval(celebrationFadeRef.current); celebrationFadeRef.current = null }
            try { el.pause(); el.currentTime = 0; el.volume = CELEBRATION_VOLUME } catch {}
          }
        }, CELEBRATION_FADE_MS / steps)
      }, fadeAt)
    } catch {}
  }, [clearCelebration])

  const stopTicking = useCallback(() => {
    if (tickRafRef.current) { cancelAnimationFrame(tickRafRef.current); tickRafRef.current = 0 }
  }, [])

  // ── Tick loop driven by the wheel's REAL rotation ──────────────────────────
  // Reads the live transform matrix each animation frame and fires one tick for
  // every segment boundary (multiple of 360/segCount) the wheel sweeps past, so
  // ticks track the visual deceleration exactly — dense at first, sparse at the end.
  const startTicking = useCallback((segCount: number) => {
    stopTicking()
    if (segCount < 1) return
    const segDeg = 360 / segCount
    const readAngle = (): number | null => {
      const el = wheelSvgRef.current
      if (!el) return null
      const tr = getComputedStyle(el).transform
      if (!tr || tr === 'none') return 0
      try {
        const m = new DOMMatrixReadOnly(tr)
        return Math.atan2(m.b, m.a) * 180 / Math.PI       // -180..180
      } catch { return null }
    }
    const startedAt    = performance.now()
    let   lastAngle    = readAngle() ?? 0
    let   traveled     = 0
    let   nextBoundary = segDeg
    let   lastTickAt   = 0
    const MIN_GAP      = 26                                // ms — caps tick rate on slow phones / at peak speed
    const loop = () => {
      const nowT    = performance.now()
      const elapsed = nowT - startedAt
      const a = readAngle()
      if (a !== null) {
        let delta = ((a - lastAngle) % 360 + 360) % 360   // forward sweep, 0..360
        if (delta > 180) delta -= 360                     // tolerate tiny backward jitter
        if (delta > 0) traveled += delta
        lastAngle = a
      }
      let crossed = 0
      while (traveled >= nextBoundary && crossed < 4) { nextBoundary += segDeg; crossed++ }
      if (crossed > 0 && nowT - lastTickAt >= MIN_GAP) {
        playTick(Math.max(0, 1 - elapsed / SPIN_MS))
        lastTickAt = nowT
      }
      if (elapsed < SPIN_MS + 120) {
        tickRafRef.current = requestAnimationFrame(loop)
      } else {
        stopTicking()
      }
    }
    tickRafRef.current = requestAnimationFrame(loop)
  }, [playTick, stopTicking])

  // Keep a ref in sync so the (memoised) spin callback reads the latest value.
  useEffect(() => { soundOnRef.current = soundOn }, [soundOn])

  // Cleanup tick timer + audio context on unmount.
  useEffect(() => () => {
    stopTicking()
    clearCelebration()
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}) ; audioCtxRef.current = null }
  }, [stopTicking, clearCelebration])

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const e = localStorage.getItem(LS_ENTRIES)
      const h = localStorage.getItem(LS_HISTORY)
      const r = localStorage.getItem(LS_REMOVE)
      const s = localStorage.getItem(LS_SOUND)
      if (e) setEntries(JSON.parse(e))
      if (h) setHistory(JSON.parse(h))
      if (r !== null) setRemoveAfterPick(JSON.parse(r))
      if (s !== null) setSoundOn(JSON.parse(s))
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

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(LS_SOUND, JSON.stringify(soundOn)) } catch {}
  }, [soundOn, loaded])

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
    if (showResult && winner && !reducedRef.current) {
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

    const isMobile = window.innerWidth < 768

    type P = {
      x: number; y: number; vx: number; vy: number
      color: string; w: number; h: number; r: number; dr: number; circle: boolean
      swayAmp: number; swayFreq: number; swayOffset: number; age: number
    }

    const particles: P[] = []

    const spawnTop = (count: number) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x:          Math.random() * canvas.width,
          y:          -10 - Math.random() * 30,
          vx:         (Math.random() - 0.5) * 8,
          vy:         Math.random() * 3 + 1.5,
          color:      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          w:          Math.random() * 13 + 5,
          h:          Math.random() * 6 + 3,
          r:          Math.random() * 360,
          dr:         (Math.random() - 0.5) * 11,
          circle:     Math.random() > 0.55,
          swayAmp:    Math.random() * 2.5,
          swayFreq:   Math.random() * 0.04 + 0.01,
          swayOffset: Math.random() * Math.PI * 2,
          age:        0,
        })
      }
    }

    const spawnSide = (fromLeft: boolean, count: number) => {
      for (let i = 0; i < count; i++) {
        const vBase = Math.random() * 9 + 4
        particles.push({
          x:          fromLeft ? -10 : canvas.width + 10,
          y:          canvas.height * (0.05 + Math.random() * 0.5),
          vx:         fromLeft ? vBase : -vBase,
          vy:         -(Math.random() * 7 + 1),
          color:      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          w:          Math.random() * 13 + 5,
          h:          Math.random() * 6 + 3,
          r:          Math.random() * 360,
          dr:         (Math.random() - 0.5) * 11,
          circle:     Math.random() > 0.55,
          swayAmp:    Math.random() * 1.5,
          swayFreq:   Math.random() * 0.03 + 0.01,
          swayOffset: Math.random() * Math.PI * 2,
          age:        0,
        })
      }
    }

    // Initial big burst
    spawnTop(isMobile ? 65 : 140)
    spawnSide(true,  isMobile ? 35 : 70)
    spawnSide(false, isMobile ? 35 : 70)

    let waveCount = 0
    const burstInterval = setInterval(() => {
      waveCount++
      spawnTop(isMobile ? 20 : 42)
      if (waveCount % 2 === 0) spawnSide(waveCount % 4 === 0, isMobile ? 14 : 30)
    }, 500)
    confettiIntervalRef.current = burstInterval

    let running = true

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.age++
        p.x  += p.vx + Math.sin(p.age * p.swayFreq + p.swayOffset) * p.swayAmp
        p.y  += p.vy
        p.vy += 0.07
        p.vx *= 0.997
        p.r  += p.dr

        if (p.y > canvas.height + 40 || p.x < -70 || p.x > canvas.width + 70) {
          particles.splice(i, 1)
          continue
        }

        const alpha = Math.min(1, Math.max(0,
          1 - Math.max(0, (p.y - canvas.height * 0.75) / (canvas.height * 0.25))
        ))

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.r * Math.PI) / 180)
        ctx.fillStyle   = p.color
        ctx.globalAlpha = alpha

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
      clearInterval(burstInterval)
      confettiIntervalRef.current = null
      cancelAnimationFrame(confettiRafRef.current)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setConfettiActive(false)
    }, 10500)

    return () => {
      running = false
      clearInterval(burstInterval)
      confettiIntervalRef.current = null
      cancelAnimationFrame(confettiRafRef.current)
      if (confettiStopRef.current) clearTimeout(confettiStopRef.current)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [confettiActive])

  // ── Entry management ───────────────────────────────────────────────────────
  const addEntries = useCallback(() => {
    const parsed = inputText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!parsed.length) return
    setSpinSnapshot(null)
    setEntries(prev => {
      const seen = new Set<string>(prev)
      const next = [...prev]
      for (const s of parsed) { if (!seen.has(s)) { seen.add(s); next.push(s) } }
      return next
    })
    setInputText('')
  }, [inputText])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (!pasted.trim()) return
    const parsed = pasted.split('\n').map(s => s.trim()).filter(Boolean)
    if (!parsed.length) return
    setSpinSnapshot(null)
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
    setHovered(null)
    setRotation(newRotation)

    // Unlock audio inside this tap (required by iOS Safari / Android Chrome): the
    // AudioContext for the ticks AND the <audio> element for the win celebration.
    if (soundOnRef.current) {
      ensureAudio()
      primeCelebration()
      startTicking(n)
    }

    setTimeout(() => {
      stopTicking()
      setSpinning(false)
      setWinner(picked)
      setShowResult(true)
      setHistory(prev => [picked, ...prev])
      if (soundOnRef.current) playCelebration()
      if (removeAfterPick) {
        setEntries(prev => prev.filter(e => e !== picked))
      }
    }, SPIN_MS + 300)
  }, [spinning, entries, rotation, removeAfterPick, ensureAudio, primeCelebration, startTicking, stopTicking, playCelebration])

  // ── Copy winner name ───────────────────────────────────────────────────────
  const copyResult = useCallback(() => {
    if (!winner) return
    navigator.clipboard.writeText(winner).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [winner])

  const closeResult = useCallback(() => {
    clearCelebration()
    setShowResult(false)
    setConfettiActive(false)
    // Re-sync the wheel to the live list (drops the just-picked name when
    // "remove after pick" is on) so wheel segments === player list again.
    setSpinSnapshot(null)
  }, [clearCelebration])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1080px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Confetti canvas */}
      <canvas
        ref={confettiCanvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 55, display: confettiActive ? 'block' : 'none' }}
      />

      {/* Winner celebration audio (applause + cheer) — fired when the wheel stops */}
      <audio ref={celebrationAudioRef} src={CELEBRATION_SRC} preload="auto" />


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
            <p
              className="font-serif font-bold text-[clamp(24px,6vw,36px)] text-ink leading-tight break-words mb-7 px-2"
              style={{ fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' } as React.CSSProperties}
            >
              {winner}
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={copyResult}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-cream border border-line text-muted hover:text-rose hover:border-rose/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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
                className="px-6 py-2.5 rounded-xl bg-rose text-white font-semibold text-[13px] hover:bg-rose-deep transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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
                svgRef={wheelSvgRef}
                entries={spinSnapshot ?? entries}
                rotation={rotation}
                spinning={spinning}
                hovered={!spinning && spinSnapshot === null ? hovered : null}
                onHover={!spinning && spinSnapshot === null ? setHovered : undefined}
              />
            </div>
          </div>

          {/* Spin button */}
          <button
            onClick={spin}
            disabled={spinning || entries.length === 0}
            className={`min-w-[180px] py-3.5 px-10 rounded-2xl font-bold text-[16px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream
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

          {/* Entry count badge + sound toggle */}
          <div className="flex items-center gap-3">
            {entries.length > 0 && !spinning && (
              <p className="text-[12.5px] text-muted/50 font-medium">
                {entries.length} {t('person_label')}
              </p>
            )}
            <button
              type="button"
              onClick={() => setSoundOn(s => !s)}
              aria-pressed={soundOn}
              title={t('sound_label')}
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                soundOn
                  ? 'bg-rose/10 border-rose/30 text-rose'
                  : 'bg-paper border-line text-muted/70 hover:text-rose hover:border-rose/30'
              }`}
            >
              <span className="select-none leading-none">{soundOn ? '🔊' : '🔇'}</span>
              {t('sound_label')}
            </button>
          </div>
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
              className="w-full resize-none rounded-xl border border-line bg-cream/50 px-3.5 py-3 text-[13.5px] text-ink placeholder-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/35 focus-visible:border-rose/40 transition-all leading-relaxed"
            />
            <div className="flex items-center gap-2.5 mt-3">
              <button
                onClick={addEntries}
                disabled={!inputText.trim()}
                className={`flex-none py-2.5 px-6 rounded-xl text-[13.5px] font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                  inputText.trim()
                    ? 'bg-rose text-white hover:bg-rose-deep shadow-sm active:scale-95'
                    : 'bg-line/50 text-muted/50 cursor-not-allowed'
                }`}
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
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-line hover:text-ink transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    🔀 {t('shuffle')}
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {t('clear_all')}
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-0.5">
                {entries.map((entry, i) => (
                  <li
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg transition-colors group/row ${hovered === i ? 'bg-cream' : 'hover:bg-cream/70'}`}
                    style={hovered === i ? { boxShadow: `inset 3px 0 0 ${PALETTE[i % PALETTE.length]}` } : undefined}
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
                      className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-[11px] text-muted/40 hover:text-red-500 transition-all flex-none px-1.5 py-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
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
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-line hover:text-ink transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  {t('clear_history')}
                </button>
              </div>
              <ol className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-0.5">
                {history.map((name, i) => {
                  const isLatest = i === 0
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg text-[13.5px] text-ink ${
                        isLatest ? 'bg-rose/8 border border-rose/20' : 'bg-cream/50'
                      }`}
                    >
                      <span className="text-muted/40 text-[11.5px] font-mono w-5 text-right flex-none shrink-0">{i + 1}.</span>
                      <span className={`flex-1 truncate ${isLatest ? 'font-semibold' : ''}`}>{name}</span>
                      {isLatest && (
                        <span className="flex-none text-[9.5px] font-bold uppercase tracking-wide text-rose bg-rose/10 border border-rose/20 px-1.5 py-0.5 rounded-full">
                          {t('latest')}
                        </span>
                      )}
                      {isLatest && <span className="text-[14px] flex-none">🏆</span>}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
