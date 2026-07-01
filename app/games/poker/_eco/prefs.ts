// Device-local poker preferences (sound / music / vibration / animation / reduced-motion).
// Persisted to localStorage so the live table and these settings agree on one source. Display /
// device-only — never sent to the server, never part of any authoritative game state.

export type PokerPrefKey = 'sound' | 'music' | 'vibration' | 'animation' | 'reducedMotion'

export const PREF_DEFAULTS: Record<PokerPrefKey, boolean> = {
  sound: true,
  music: false,
  vibration: true,
  animation: true,
  reducedMotion: false,
}

const STORAGE_KEY = 'poker:prefs'

export function readPrefs(): Record<PokerPrefKey, boolean> {
  if (typeof window === 'undefined') return { ...PREF_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...PREF_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Record<PokerPrefKey, boolean>>
    return { ...PREF_DEFAULTS, ...parsed }
  } catch {
    return { ...PREF_DEFAULTS }
  }
}

export function writePrefs(prefs: Record<PokerPrefKey, boolean>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage may be unavailable (private mode) — preferences simply don't persist */
  }
}
