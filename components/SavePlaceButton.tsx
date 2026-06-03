'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'chococfko_saved_places'
const META_KEY = 'chococfko_saved_places_meta'

interface SavedEntry {
  slug: string
  name: string
  area: string
  category: string
  img: string
}

function getSaved(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function setSaved(slugs: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs))
}

function getMetaCache(): Record<string, SavedEntry> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function setMetaCache(meta: Record<string, SavedEntry>) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

interface Props {
  slug: string
  name: string
  area?: string
  img?: string
  categoryLabel?: string
  size?: 'sm' | 'md'
}

export default function SavePlaceButton({ slug, name, area = '', img = '', categoryLabel = '', size = 'sm' }: Props) {
  const [saved, setSavedState] = useState(false)

  useEffect(() => {
    setSavedState(getSaved().includes(slug))
  }, [slug])

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const current = getSaved()
    let next: string[]
    if (current.includes(slug)) {
      next = current.filter((s) => s !== slug)
      // Remove from meta too
      const meta = getMetaCache()
      delete meta[slug]
      setMetaCache(meta)
    } else {
      next = [...current, slug]
      // Save meta so saved-places page can render full card
      const meta = getMetaCache()
      meta[slug] = { slug, name, area, category: categoryLabel, img }
      setMetaCache(meta)
    }
    setSaved(next)
    setSavedState(next.includes(slug))
    window.dispatchEvent(new CustomEvent('savedPlacesChanged'))
  }

  const sz = size === 'md'
    ? 'w-9 h-9 text-[18px]'
    : 'w-7 h-7 text-[14px]'

  return (
    <button
      onClick={toggle}
      aria-label={saved ? `Bỏ lưu ${name}` : `Lưu ${name}`}
      title={saved ? `Bỏ lưu ${name}` : `Lưu ${name}`}
      className={`${sz} flex items-center justify-center rounded-full transition-all duration-200 ${
        saved
          ? 'bg-rose text-white shadow-[0_2px_8px_-2px_rgba(194,24,91,0.5)]'
          : 'bg-paper/90 text-muted border border-line hover:border-rose/40 hover:text-rose'
      }`}
    >
      {saved ? '♥' : '♡'}
    </button>
  )
}

// Hook for reading saved slugs (used in saved places page)
export function useSavedPlaces() {
  const [slugs, setSlugs] = useState<string[]>([])

  useEffect(() => {
    setSlugs(getSaved())
    const handler = () => setSlugs(getSaved())
    window.addEventListener('savedPlacesChanged', handler)
    return () => window.removeEventListener('savedPlacesChanged', handler)
  }, [])

  return slugs
}
