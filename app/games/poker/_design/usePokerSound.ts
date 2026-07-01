'use client'

// ── Poker sound — synthesised, optional, recovery-safe ─────────────────────────────────────
//
// A module-level singleton owning ONE AudioContext (the dead-mobile-sound lesson from TLMN:
// never create a context per hook; unlock it on the first user gesture). Sounds are short
// WebAudio synth blips — no asset downloads — for deal, card flip, chip movement, check, call,
// raise, all-in, the timer warning, pot award and a new hand.
//
// AUTHORITY: sound is pure presentation. It is triggered by the same animation-safe transition
// cues the table derives from authoritative snapshots, and is therefore NEVER replayed on a
// snapshot recovery / reconnect (the cue diff already suppresses non-contiguous jumps). Mute and
// the prefers-reduced-motion-style "quiet" preference persist in localStorage and are shared
// across all consumers via useSyncExternalStore so a single toggle is global and consistent.

import { useCallback, useSyncExternalStore } from 'react'

export type PokerSoundName =
  | 'deal'
  | 'flip'
  | 'chip'
  | 'check'
  | 'call'
  | 'raise'
  | 'allin'
  | 'timerWarn'
  | 'potAward'
  | 'newHand'

const MUTE_KEY = 'poker:muted'

// ── Shared mute state (useSyncExternalStore) ────────────────────────────────────────────────
let muted = ((): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getMuted(): boolean {
  return muted
}
function setMutedState(next: boolean) {
  muted = next
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    /* private mode — in-memory only */
  }
  emit()
}

// ── The single AudioContext, lazily created + gesture-unlocked ───────────────────────────────
type AudioCtor = typeof AudioContext
let ctx: AudioContext | null = null
let unlockBound = false

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

// Resume the context on the first pointer/key/touch — mobile browsers start it suspended and
// reject playback until a user gesture. Bound once, globally.
function bindUnlock() {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true
  const resume = () => {
    const c = audioContext()
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined)
  }
  const opts: AddEventListenerOptions = { passive: true }
  window.addEventListener('pointerdown', resume, opts)
  window.addEventListener('keydown', resume, opts)
  window.addEventListener('touchstart', resume, opts)
}

// One synth voice: a short tone with an exponential decay envelope.
function blip(
  c: AudioContext,
  opts: { freq: number; dur: number; type?: OscillatorType; gain?: number; sweepTo?: number; delay?: number },
) {
  const t0 = c.currentTime + (opts.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), t0 + opts.dur)
  const peak = opts.gain ?? 0.16
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.02)
}

// A soft filtered-noise burst — used for chip/card "shuffle" textures.
function noise(c: AudioContext, opts: { dur: number; gain?: number; delay?: number; hp?: number }) {
  const t0 = c.currentTime + (opts.delay ?? 0)
  const frames = Math.floor(c.sampleRate * opts.dur)
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = c.createBufferSource()
  src.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = opts.hp ?? 2200
  const g = c.createGain()
  g.gain.setValueAtTime(opts.gain ?? 0.12, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  src.connect(hp).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + opts.dur + 0.02)
}

function render(name: PokerSoundName, c: AudioContext) {
  switch (name) {
    case 'deal':
      noise(c, { dur: 0.07, gain: 0.1, hp: 2600 })
      break
    case 'flip':
      noise(c, { dur: 0.05, gain: 0.09, hp: 3200 })
      blip(c, { freq: 520, dur: 0.05, type: 'triangle', gain: 0.06 })
      break
    case 'chip':
      noise(c, { dur: 0.05, gain: 0.08, hp: 4000 })
      blip(c, { freq: 880, dur: 0.06, type: 'square', gain: 0.05 })
      blip(c, { freq: 760, dur: 0.06, type: 'square', gain: 0.05, delay: 0.04 })
      break
    case 'check':
      blip(c, { freq: 300, dur: 0.08, type: 'sine', gain: 0.1 })
      break
    case 'call':
      blip(c, { freq: 520, dur: 0.1, type: 'triangle', gain: 0.12 })
      noise(c, { dur: 0.05, gain: 0.06, hp: 4000, delay: 0.02 })
      break
    case 'raise':
      blip(c, { freq: 480, dur: 0.12, type: 'sawtooth', gain: 0.11, sweepTo: 760 })
      noise(c, { dur: 0.06, gain: 0.07, hp: 3800, delay: 0.05 })
      break
    case 'allin':
      blip(c, { freq: 420, dur: 0.18, type: 'sawtooth', gain: 0.13, sweepTo: 980 })
      blip(c, { freq: 660, dur: 0.22, type: 'triangle', gain: 0.1, delay: 0.1 })
      break
    case 'timerWarn':
      blip(c, { freq: 880, dur: 0.09, type: 'square', gain: 0.1 })
      blip(c, { freq: 880, dur: 0.09, type: 'square', gain: 0.1, delay: 0.16 })
      break
    case 'potAward':
      blip(c, { freq: 523, dur: 0.16, type: 'triangle', gain: 0.13 })
      blip(c, { freq: 659, dur: 0.18, type: 'triangle', gain: 0.12, delay: 0.1 })
      blip(c, { freq: 784, dur: 0.26, type: 'triangle', gain: 0.12, delay: 0.2 })
      break
    case 'newHand':
      blip(c, { freq: 392, dur: 0.12, type: 'sine', gain: 0.1 })
      blip(c, { freq: 587, dur: 0.16, type: 'sine', gain: 0.1, delay: 0.09 })
      break
  }
}

export function playPokerSound(name: PokerSoundName) {
  if (muted) return
  const c = audioContext()
  if (!c) return
  if (c.state === 'suspended') {
    // Not yet unlocked by a gesture — skip silently (never queue stale sound).
    void c.resume().catch(() => undefined)
    return
  }
  try {
    render(name, c)
  } catch {
    /* audio is best-effort */
  }
}

export interface PokerSoundApi {
  readonly muted: boolean
  readonly toggleMuted: () => void
  readonly setMuted: (v: boolean) => void
  readonly play: (name: PokerSoundName) => void
}

export function usePokerSound(): PokerSoundApi {
  const isMuted = useSyncExternalStore(subscribe, getMuted, () => false)

  const play = useCallback((name: PokerSoundName) => {
    bindUnlock()
    playPokerSound(name)
  }, [])
  const toggleMuted = useCallback(() => setMutedState(!getMuted()), [])
  const setMuted = useCallback((v: boolean) => setMutedState(v), [])

  return { muted: isMuted, toggleMuted, setMuted, play }
}
