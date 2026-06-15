'use client'

import { useEffect } from 'react'

// Casual-user deterrent: block right-click "Save image", drag-to-desktop and
// mobile long-press on <img> elements. This does NOT stop someone who opens
// DevTools (they can save from the Network tab) — that is impossible to prevent on
// any website. Real protection against reuse comes from the baked-in watermark
// served by /api/img.
export default function ImageProtection() {
  useEffect(() => {
    const isImg = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'IMG' || t.closest('img') !== null)

    const onContext = (e: MouseEvent) => { if (isImg(e.target)) e.preventDefault() }
    const onDrag = (e: DragEvent) => { if (isImg(e.target)) e.preventDefault() }

    document.addEventListener('contextmenu', onContext)
    document.addEventListener('dragstart', onDrag)
    return () => {
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('dragstart', onDrag)
    }
  }, [])

  return null
}
