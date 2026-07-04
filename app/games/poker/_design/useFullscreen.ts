'use client'

// ── Fullscreen — optional, user-initiated, never trapping ────────────────────────────────────
//
// Wraps the Fullscreen API with the WebKit-prefixed fallback so a player can go edge-to-edge on
// the table. STRICT rules (visual-spec + phase brief):
//   • only ever entered from a user gesture (the caller wires it to a tap) — never auto-forced;
//   • always offers a clear exit (state flips the HUD glyph) — never a trap;
//   • degrades to `supported: false` where the API is missing (notably iPhone Safari, which does
//     not expose element fullscreen) so the caller can hide the control entirely;
//   • swallows the promise rejection a browser throws when it denies the request.
// It targets an optional element (the poker root) so safe-area padding + all HUD stay intact.

import { useCallback, useEffect, useState, type RefObject } from 'react'

interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null
  const d = document as FsDocument
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.documentElement as FsElement
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

export interface FullscreenApi {
  readonly supported: boolean
  readonly isFullscreen: boolean
  readonly enter: () => Promise<void>
  readonly exit: () => Promise<void>
  readonly toggle: () => Promise<void>
}

export function useFullscreen(targetRef?: RefObject<HTMLElement>): FullscreenApi {
  const [supported, setSupported] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setSupported(fullscreenSupported())
    const onChange = () => setIsFullscreen(fullscreenElement() != null)
    onChange()
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener)
    }
  }, [])

  const enter = useCallback(async () => {
    const el = (targetRef?.current ?? document.documentElement) as FsElement
    try {
      if (typeof el.requestFullscreen === 'function') await el.requestFullscreen()
      else if (typeof el.webkitRequestFullscreen === 'function') await el.webkitRequestFullscreen()
    } catch {
      // Rejected (no user gesture / permission denied) — degrade gracefully, stay windowed.
    }
  }, [targetRef])

  const exit = useCallback(async () => {
    const d = document as FsDocument
    try {
      if (typeof document.exitFullscreen === 'function') await document.exitFullscreen()
      else if (typeof d.webkitExitFullscreen === 'function') await d.webkitExitFullscreen()
    } catch {
      /* already exited — ignore */
    }
  }, [])

  const toggle = useCallback(async () => {
    if (fullscreenElement()) await exit()
    else await enter()
  }, [enter, exit])

  return { supported, isFullscreen, enter, exit, toggle }
}
