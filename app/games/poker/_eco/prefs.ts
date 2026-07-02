// Device-local poker preferences — the SINGLE source of truth for sound / haptics / motion.
//
// Persisted to localStorage (`poker:prefs`) so the live table, the settings screen and every
// consumer agree on ONE reactive store. Display / device-only — never sent to the server, never
// part of any authoritative game state.
//
// Independent categories (visual-spec: "provide independent settings"):
//   sound        — MASTER audio gate (off ⇒ silence everything)
//   effects      — gameplay SFX (deal / chip / check / call / raise / all-in / pot …)
//   music        — background music (reserved; no music assets ship in this release, so this
//                  toggle is inert today but persists for forward-compat)
//   timerWarning — the "time is running out" cue (sound + haptic), independently silenceable
//   vibration    — haptic feedback (navigator.vibrate); independent of the audio master
//   animation    — nonessential travel/celebration animation
//   reducedMotion— force reduced motion regardless of the OS setting
//
// The store is reactive: writes notify subscribers in the same tab (so toggling in Settings
// instantly affects the open table) and a `storage` listener keeps other tabs in sync.

import { useSyncExternalStore } from 'react'

export type PokerPrefKey =
  | 'sound'
  | 'effects'
  | 'music'
  | 'timerWarning'
  | 'vibration'
  | 'animation'
  | 'reducedMotion'

export type PokerPrefs = Record<PokerPrefKey, boolean>

export const PREF_DEFAULTS: PokerPrefs = {
  sound: true,
  effects: true,
  music: false,
  timerWarning: true,
  vibration: true,
  animation: true,
  reducedMotion: false,
}

const STORAGE_KEY = 'poker:prefs'

function load(): PokerPrefs {
  if (typeof window === 'undefined') return { ...PREF_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...PREF_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PokerPrefs>
    // Merge over defaults so newly-added keys are populated for existing users.
    return { ...PREF_DEFAULTS, ...parsed }
  } catch {
    return { ...PREF_DEFAULTS }
  }
}

// ── Reactive store ────────────────────────────────────────────────────────────────────────────
let current: PokerPrefs = load()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function persist(next: PokerPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage may be unavailable (private mode) — preferences simply don't persist */
  }
}

// Keep tabs in sync (Settings in one tab, table in another).
let storageBound = false
function bindStorage() {
  if (storageBound || typeof window === 'undefined') return
  storageBound = true
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    current = load()
    emit()
  })
}

export function getPrefs(): PokerPrefs {
  return current
}

export function subscribePrefs(cb: () => void): () => void {
  bindStorage()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setPref(key: PokerPrefKey, value: boolean): void {
  if (current[key] === value) return
  current = { ...current, [key]: value }
  persist(current)
  emit()
}

export function setPrefs(next: PokerPrefs): void {
  current = { ...next }
  persist(current)
  emit()
}

export function resetPrefs(): void {
  setPrefs({ ...PREF_DEFAULTS })
}

// React hook — subscribes to the reactive store. SSR/first paint returns defaults.
export function usePokerPrefs(): PokerPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, () => PREF_DEFAULTS)
}

// ── Legacy helpers (kept for compatibility) ────────────────────────────────────────────────────
export function readPrefs(): PokerPrefs {
  return getPrefs()
}
export function writePrefs(prefs: PokerPrefs): void {
  setPrefs(prefs)
}
