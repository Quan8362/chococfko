'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

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

// ── Single authoritative sound state (module-level singleton) ────────────────────────
// The table mounts TWO consumers of this hook at once (TlmnRoom's lobby chimes + the
// in-game TlmnTable, which owns the mute button). A per-hook `muted` useState would give
// each its OWN copy + its OWN AudioContext, so muting in-game would NOT silence the lobby
// chimes and two audio graphs would compete. We therefore hold ONE AudioContext and ONE
// mute value at module scope, exposed to every consumer via useSyncExternalStore. State
// changes (and cross-tab `storage` events) notify all consumers, so the icon and the real
// audio engine can never drift apart.
let sharedCtx: AudioContext | null = null
let sharedMuted = false
let mutedHydrated = false
const mutedSubs = new Set<() => void>()

function notifyMuted() { mutedSubs.forEach(fn => fn()) }

function readStoredMuted(): boolean {
  try { return localStorage.getItem(LS_KEY) === '1' } catch { return false }
}

// Create (once) the AudioContext and resume it if the browser left it suspended.
// Mobile browsers (iOS Safari / Android Chrome) create every AudioContext in the
// `suspended` state and ONLY allow `resume()` to take effect when it is called from
// within a real user-gesture handler. The previous code created the context lazily inside
// play() — which always runs AFTER an async game event, i.e. NEVER inside a gesture — so
// the context stayed suspended forever and no sound ever played, regardless of the mute
// icon. getCtx() must therefore be reachable from a genuine gesture (the sound button +
// the one-shot global unlock listener below).
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try { sharedCtx = new Ctor() } catch { return null }
  }
  if (sharedCtx && sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {})
  return sharedCtx
}

function setMutedShared(next: boolean) {
  sharedMuted = next
  try { localStorage.setItem(LS_KEY, next ? '1' : '0') } catch {}
  notifyMuted()
}

function subscribeMuted(cb: () => void) {
  mutedSubs.add(cb)
  return () => { mutedSubs.delete(cb) }
}

export function useTlmnSound() {
  // Hydrate the stored preference once (client only) before the first subscriber reads it.
  if (!mutedHydrated && typeof window !== 'undefined') {
    mutedHydrated = true
    sharedMuted = readStoredMuted()
  }
  const muted = useSyncExternalStore(subscribeMuted, () => sharedMuted, () => false)

  // Keep all consumers (incl. other tabs) in sync with the persisted preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) { sharedMuted = e.newValue === '1'; notifyMuted() }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // One-shot audio unlock: the FIRST real user gesture anywhere on the table (tapping a
  // card, the play button, etc.) creates + resumes the AudioContext so later game-driven
  // sounds are audible without requiring the player to press the sound button first.
  // Self-removes once the context actually reaches `running`. Capture phase so it never
  // blocks the gesture it piggy-backs on.
  useEffect(() => {
    const unlock = () => {
      const c = getCtx()
      if (c && c.state !== 'running') return // keep listening until it actually resumes
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchend', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('touchend', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchend', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [])

  const toggleMute = useCallback(() => {
    // The button tap IS a valid user gesture — use it to unlock/resume the shared context
    // so turning sound ON makes audio immediately audible (the real root-cause fix on
    // mobile). A short confirmation blip plays ONLY when unmuting so the user gets instant
    // feedback that audio now works (never a loud autoplay).
    const next = !sharedMuted
    setMutedShared(next)
    if (!next) {
      const ctx = getCtx()
      if (ctx) {
        try {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const start = ctx.currentTime
          osc.type = 'sine'
          osc.frequency.setValueAtTime(660, start)
          gain.gain.setValueAtTime(0.0001, start)
          gain.gain.exponentialRampToValueAtTime(0.12, start + 0.012)
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)
          osc.connect(gain); gain.connect(ctx.destination)
          osc.start(start); osc.stop(start + 0.14)
        } catch { /* ignore */ }
      }
    }
  }, [])

  const play = useCallback((name: TlmnSoundName) => {
    if (sharedMuted) return
    const ctx = getCtx()
    if (!ctx || ctx.state !== 'running') return // never queue voices on a suspended/locked ctx
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
  }, [])

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern)
      }
    } catch { /* unsupported */ }
  }, [])

  return { muted, toggleMute, play, vibrate }
}
