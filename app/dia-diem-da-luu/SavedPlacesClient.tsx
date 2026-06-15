'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { imgProxy } from '@/lib/avatar'

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

function getMetaCache(): Record<string, SavedEntry> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function removeSaved(slug: string) {
  const current = getSaved().filter((s) => s !== slug)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  const meta = getMetaCache()
  delete meta[slug]
  localStorage.setItem(META_KEY, JSON.stringify(meta))
  window.dispatchEvent(new CustomEvent('savedPlacesChanged'))
}

interface Props {
  emptyTitle: string
  emptySub: string
  exploreCta: string
  detailLabel: string
  unsaveLabel: string
}

export default function SavedPlacesClient({ emptyTitle, emptySub, exploreCta, detailLabel, unsaveLabel }: Props) {
  const [slugs, setSlugs] = useState<string[]>([])
  const [meta, setMeta] = useState<Record<string, SavedEntry>>({})
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSlugs(getSaved())
    setMeta(getMetaCache())
    setMounted(true)

    const handler = () => {
      setSlugs(getSaved())
      setMeta(getMetaCache())
    }
    window.addEventListener('savedPlacesChanged', handler)
    return () => window.removeEventListener('savedPlacesChanged', handler)
  }, [])

  if (!mounted) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-paper border border-line rounded-2xl h-[200px] animate-pulse" />
        ))}
      </div>
    )
  }

  if (slugs.length === 0) {
    return (
      <div className="bg-paper border border-line rounded-2xl p-12 text-center shadow-card">
        <div className="text-[48px] mb-4">♡</div>
        <h2 className="font-serif font-bold text-[20px] text-ink mb-2">{emptyTitle}</h2>
        <p className="text-[14.5px] text-muted mb-7 max-w-[340px] mx-auto">{emptySub}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
        >
          {exploreCta}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {slugs.map((slug) => {
        const entry = meta[slug]
        return (
          <div
            key={slug}
            className="bg-paper border border-line rounded-2xl overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all group"
          >
            {/* Image placeholder */}
            {entry?.img ? (
              <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgProxy(entry.img)} alt={entry?.name ?? slug} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" loading="lazy" />
              </div>
            ) : (
              <div className="h-36 bg-gradient-to-br from-rose-soft to-[#f3e1d2] flex items-center justify-center">
                <span className="text-[32px] opacity-40">📍</span>
              </div>
            )}

            <div className="p-4">
              {entry?.area && (
                <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal block mb-1">
                  {entry.area}
                </span>
              )}
              <h3 className="font-serif font-bold text-[17px] text-ink leading-snug mb-3">
                {entry?.name ?? slug}
              </h3>

              <div className="flex gap-2">
                <Link
                  href={`/dia-diem/${slug}`}
                  className="flex-1 text-center py-2 text-[12px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all"
                >
                  {detailLabel}
                </Link>
                <button
                  onClick={() => removeSaved(slug)}
                  className="flex-none w-9 h-9 flex items-center justify-center rounded-xl bg-rose text-white hover:bg-rose-deep transition-colors"
                  title={unsaveLabel}
                >
                  ♥
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
