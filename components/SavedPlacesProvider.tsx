'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { parseSlugs } from '@/lib/savedPlaces'
import { getSavedState, toggleSave, mergeSaves } from '@/app/places/saved-actions'

const STORAGE_KEY = 'chococfko_saved_places' // reuse legacy key so guest saves carry over

interface SavedCtx {
  saved: Set<string>
  loggedIn: boolean
  ready: boolean
  isSaved: (slug: string) => boolean
  toggle: (slug: string) => void
}

const Ctx = createContext<SavedCtx | null>(null)

function readLocal(): string[] {
  if (typeof window === 'undefined') return []
  return parseSlugs(localStorage.getItem(STORAGE_KEY))
}
function writeLocal(slugs: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs)) } catch { /* ignore */ }
}

export default function SavedPlacesProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [loggedIn, setLoggedIn] = useState(false)
  const [ready, setReady] = useState(false)
  const loggedInRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const local = readLocal()
      const state = await getSavedState()
      if (cancelled) return
      if (state.loggedIn) {
        // Merge any guest saves into the account (dedup), then drop the local copy.
        if (local.length) {
          const merged = await mergeSaves(local)
          if (cancelled) return
          setSaved(new Set(merged.ok ? merged.slugs : state.slugs))
          writeLocal([])
        } else {
          setSaved(new Set(state.slugs))
        }
        setLoggedIn(true)
        loggedInRef.current = true
      } else {
        setSaved(new Set(local))
      }
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback((slug: string) => {
    const s = slug.trim()
    if (!s) return
    setSaved((prev) => {
      const next = new Set(prev)
      const willSave = !next.has(s)
      if (willSave) next.add(s); else next.delete(s)
      if (loggedInRef.current) {
        // optimistic; revert on failure
        toggleSave(s).then((r) => {
          if (!r.ok) setSaved((cur) => { const back = new Set(cur); if (willSave) back.delete(s); else back.add(s); return back })
        })
      } else {
        writeLocal(Array.from(next))
      }
      return next
    })
  }, [])

  const value = useMemo<SavedCtx>(() => ({
    saved, loggedIn, ready,
    isSaved: (slug: string) => saved.has(slug),
    toggle,
  }), [saved, loggedIn, ready, toggle])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSavedPlaces(): SavedCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Safe no-op fallback if used outside the provider (keeps cards from crashing).
    return { saved: new Set(), loggedIn: false, ready: false, isSaved: () => false, toggle: () => {} }
  }
  return ctx
}
