'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

interface GifItem {
  id: string
  previewUrl: string
  originalUrl: string
  title: string
}

interface Props {
  onSelect: (url: string) => void
  onClose: () => void
}

function mapGiphy(data: GiphyGif[]): GifItem[] {
  return (data ?? []).map((item) => ({
    id: item.id,
    previewUrl:
      item.images?.fixed_height_small?.url ||
      item.images?.fixed_height?.url ||
      '',
    originalUrl:
      item.images?.original?.url ||
      item.images?.fixed_height?.url ||
      '',
    title: item.title ?? '',
  }))
}

interface GiphyGif {
  id: string
  title: string
  images: {
    original?: { url: string }
    fixed_height?: { url: string }
    fixed_height_small?: { url: string }
  }
}

const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY

export default function GifPicker({ onSelect, onClose }: Props) {
  const t = useTranslations('confessions')
  const te = (k: string) => t(`editor.${k}` as Parameters<typeof t>[0])
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<GifItem[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load trending on first open
  useEffect(() => {
    if (!API_KEY) return
    setLoading(true)
    fetch(
      `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=18&rating=pg`
    )
      .then((r) => r.json())
      .then((d) => setGifs(mapGiphy(d.data)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      // Reset to trending when query cleared
      if (API_KEY) {
        setLoading(true)
        fetch(
          `https://api.giphy.com/v1/gifs/trending?api_key=${API_KEY}&limit=18&rating=pg`
        )
          .then((r) => r.json())
          .then((d) => setGifs(mapGiphy(d.data)))
          .catch(() => {})
          .finally(() => setLoading(false))
      }
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (!API_KEY) return
      setLoading(true)
      try {
        const r = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(query)}&limit=18&rating=pg`
        )
        const d = await r.json()
        setGifs(mapGiphy(d.data))
      } catch {
        setGifs([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [query])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!API_KEY) {
    return (
      <div
        ref={ref}
        className="absolute left-0 top-full mt-1 z-[200] bg-white border border-line rounded-2xl shadow-[0_8px_32px_-8px_rgba(36,26,23,0.22)] p-4"
        style={{ width: 280 }}
      >
        <p className="text-[12.5px] text-muted text-center leading-relaxed">
          {te('gifNoKey')}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-[200] bg-white border border-line rounded-2xl shadow-[0_8px_32px_-8px_rgba(36,26,23,0.22)] overflow-hidden flex flex-col"
      style={{ width: 288 }}
    >
      {/* Search input */}
      <div className="px-2.5 py-2 border-b border-line/60 bg-cream/30">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={te('gifSearch')}
          className="w-full text-[13px] px-3 py-1.5 rounded-lg border border-line bg-white focus:outline-none focus:border-rose/50 focus:ring-1 focus:ring-rose/10 text-ink placeholder:text-muted/50"
          autoFocus
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
      </div>

      {/* Grid */}
      <div className="p-1.5 grid grid-cols-3 gap-1 max-h-[210px] overflow-y-auto">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center py-8">
            <svg className="w-5 h-5 animate-spin text-rose" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : gifs.length === 0 ? (
          <p className="col-span-3 text-center text-[12px] text-muted/70 py-6">
            {te('gifNotFound')}
          </p>
        ) : (
          gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(gif.originalUrl)
                onClose()
              }}
              title={gif.title}
              className="rounded-lg overflow-hidden hover:ring-2 hover:ring-rose/50 transition-all bg-line/20 aspect-video"
            >
              <img
                src={gif.previewUrl}
                alt={gif.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))
        )}
      </div>

      {/* Attribution */}
      <div className="px-3 py-1 border-t border-line/40 flex justify-end">
        <span className="text-[10px] text-muted/40">Powered by GIPHY</span>
      </div>
    </div>
  )
}
