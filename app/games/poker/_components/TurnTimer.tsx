'use client'

// ── TurnTimer — isolated, self-ticking countdown ring ───────────────────────────────────────
//
// PERFORMANCE: this component owns its own ticking state and renders in its OWN compositor layer
// (.pk-timer-ring → contain: layout style paint). The surrounding PlayerSeat / table NEVER
// re-renders on a tick — only this SVG's stroke + the seconds text update. It animates the ring
// via stroke-dashoffset (a cheap, GPU-friendly transform-like paint), not layout.
//
// AUTHORITY: the deadline is server-authoritative (turnDeadline, epoch ms). This is a DISPLAY
// countdown only — when it hits zero the server resolves the timeout; the client never enforces
// it. Under prefers-reduced-motion the smooth sweep is dropped (CSS) but the seconds still update.

import { useEffect, useRef, useState } from 'react'

export interface TurnTimerProps {
  /** server-authoritative epoch-ms deadline; null hides the timer. */
  deadline: number | null
  /** the full turn budget in seconds (e.g. 15) used to scale the ring. */
  totalSeconds: number
  size?: number
  /** seconds remaining at/under which the timer enters the warning state. */
  warnAt?: number
  /** optional: notify the seat when the warning threshold is first crossed (e.g. to haptic-buzz). */
  onWarn?: () => void
}

export function TurnTimer({ deadline, totalSeconds, size = 40, warnAt = 5, onWarn }: TurnTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    deadline ? Math.max(0, deadline - Date.now()) : 0
  )
  const warnedRef = useRef(false)

  useEffect(() => {
    warnedRef.current = false
    if (deadline == null) {
      setRemainingMs(0)
      return
    }
    let raf = 0
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      setRemainingMs(left)
      if (!warnedRef.current && left <= warnAt * 1000 && left > 0) {
        warnedRef.current = true
        onWarn?.()
      }
      if (left > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deadline, warnAt, onWarn])

  if (deadline == null) return null

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const frac = totalSeconds > 0 ? Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000))) : 0
  const warning = secondsLeft <= warnAt
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  const color = warning ? 'var(--pk-amber)' : 'var(--pk-gold-soft)'

  return (
    <span
      className="pk-timer-ring relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${secondsLeft}s`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <span
        className={`absolute font-bold tabular-nums ${warning ? 'pk-anim-timer-flash' : ''}`}
        style={{
          fontSize: size * 0.32,
          color: warning ? 'var(--pk-amber)' : 'var(--pk-text-hi)',
          animation: warning ? 'pk-timer-flash 0.9s ease-in-out infinite' : undefined,
        }}
      >
        {secondsLeft}
      </span>
    </span>
  )
}
