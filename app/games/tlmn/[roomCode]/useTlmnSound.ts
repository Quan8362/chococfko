'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Lightweight WebAudio synth for the TLMN table — no audio assets, just short,
// pleasant oscillator stings. Mute state is persisted in localStorage so it sticks
// across reloads. Haptics (navigator.vibrate) are exposed separately and guarded.

const LS_KEY = 'tlmn-muted'

export type TlmnSoundName =
  | 'deal' | 'play' | 'pass' | 'turn' | 'chat' | 'win' | 'toitrang'

type ToneSpec = { f: number; t: number; dur: number; type?: OscillatorType; vol?: number; slideTo?: number }

const SOUNDS: Record<TlmnSoundName, ToneSpec[]> = {
  // quick rising pluck — a card lands
  deal: [{ f: 420, t: 0, dur: 0.1, type: 'triangle', vol: 0.16, slideTo: 560 }],
  // soft tap when a combo hits the table
  play: [{ f: 300, t: 0, dur: 0.09, type: 'square', vol: 0.13, slideTo: 360 }],
  // muted low thud for a pass
  pass: [{ f: 180, t: 0, dur: 0.14, type: 'sine', vol: 0.14, slideTo: 120 }],
  // clear two-note ping: it's your turn
  turn: [
    { f: 880, t: 0, dur: 0.12, type: 'sine', vol: 0.2 },
    { f: 1175, t: 0.11, dur: 0.16, type: 'sine', vol: 0.2 },
  ],
  // punchy chặt/bomb — a dramatic down-sweep over a low body
  chat: [
    { f: 140, t: 0, dur: 0.32, type: 'sawtooth', vol: 0.22, slideTo: 70 },
    { f: 720, t: 0, dur: 0.22, type: 'square', vol: 0.16, slideTo: 240 },
  ],
  // triumphant arpeggio (C–E–G–C) on a win
  win: [
    { f: 523, t: 0, dur: 0.14, type: 'triangle', vol: 0.2 },
    { f: 659, t: 0.12, dur: 0.14, type: 'triangle', vol: 0.2 },
    { f: 784, t: 0.24, dur: 0.14, type: 'triangle', vol: 0.2 },
    { f: 1047, t: 0.36, dur: 0.3, type: 'triangle', vol: 0.22 },
  ],
  // distinct tới-trắng sting — brighter, sparkly, longer
  toitrang: [
    { f: 784, t: 0, dur: 0.13, type: 'sine', vol: 0.22 },
    { f: 988, t: 0.1, dur: 0.13, type: 'sine', vol: 0.22 },
    { f: 1319, t: 0.2, dur: 0.13, type: 'sine', vol: 0.22 },
    { f: 1568, t: 0.3, dur: 0.13, type: 'sine', vol: 0.22 },
    { f: 2093, t: 0.42, dur: 0.4, type: 'triangle', vol: 0.2 },
  ],
}

export function useTlmnSound() {
  const [muted, setMuted] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY) === '1'
      setMuted(v)
      mutedRef.current = v
    } catch { /* private mode */ }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev
      mutedRef.current = next
      try { localStorage.setItem(LS_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try { ctxRef.current = new Ctor() } catch { return null }
    }
    const c = ctxRef.current
    if (c && c.state === 'suspended') c.resume().catch(() => {})
    return c
  }, [])

  const play = useCallback((name: TlmnSoundName) => {
    if (mutedRef.current) return
    const ctx = getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    for (const s of SOUNDS[name]) {
      try {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = s.type ?? 'sine'
        const start = now + s.t
        osc.frequency.setValueAtTime(s.f, start)
        if (s.slideTo) osc.frequency.exponentialRampToValueAtTime(s.slideTo, start + s.dur)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(s.vol ?? 0.18, start + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + s.dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + s.dur + 0.02)
      } catch { /* ignore a single failed voice */ }
    }
  }, [getCtx])

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern)
      }
    } catch { /* unsupported */ }
  }, [])

  return { muted, toggleMute, play, vibrate }
}
