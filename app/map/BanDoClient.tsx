'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import SavePlaceButton from '@/components/SavePlaceButton'
import { imgProxy } from '@/lib/avatar'

const CAT_EMOJI: Record<string, string> = {
  landmark: '🏯', food: '🍜', sea: '🏖️', camp: '⛺', mountain: '⛰️',
  park: '🌳', viet: '🥢', grocery: '🛒', izakaya: '🍺', japanese: '🍣',
  thai: '🌶️', chinese: '🥡', korean: '🥩', cafe_milk_tea: '☕', kids_playground: '🎠', onsen: '♨️',
}

interface PlaceData {
  slug: string
  name: string
  area: string
  category: string
  categoryLabel: string
  mapUrl: string
  img: string
  imgFallback: string
}

interface Props {
  places: PlaceData[]
  areas: string[]
  cats: string[]
  filterAll: string
  filterTopic: string
  filterArea: string
  openMaps: string
  detail: string
  count: string
  noResults: string
}

export default function BanDoClient({ places, areas, cats, filterAll, filterTopic, filterArea, openMaps, detail, count, noResults }: Props) {
  const [selCat, setSelCat] = useState<string>('')
  const [selArea, setSelArea] = useState<string>('')

  const filtered = useMemo(() => {
    return places.filter((p) => {
      if (selCat && p.category !== selCat) return false
      if (selArea && p.area !== selArea) return false
      return true
    })
  }, [places, selCat, selArea])

  return (
    <>
      {/* Filters */}
      <div className="bg-paper border border-line rounded-2xl p-5 mb-8 shadow-card flex flex-col gap-4">
        {/* Category chips */}
        <div>
          <p className="text-[11.5px] font-semibold text-muted uppercase tracking-[1px] mb-2.5">{filterTopic}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelCat('')}
              className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${
                selCat === ''
                  ? 'bg-rose text-white border-rose shadow-sm'
                  : 'bg-cream border-line text-muted hover:border-rose/40 hover:text-rose'
              }`}
            >
              {filterAll}
            </button>
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setSelCat(selCat === c ? '' : c)}
                className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${
                  selCat === c
                    ? 'bg-rose text-white border-rose shadow-sm'
                    : 'bg-cream border-line text-muted hover:border-rose/40 hover:text-rose'
                }`}
              >
                {CAT_EMOJI[c]} {places.find((p) => p.category === c)?.categoryLabel ?? c}
              </button>
            ))}
          </div>
        </div>

        {/* Area select */}
        {areas.length > 0 && (
          <div>
            <p className="text-[11.5px] font-semibold text-muted uppercase tracking-[1px] mb-2.5">{filterArea}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelArea('')}
                className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${
                  selArea === ''
                    ? 'bg-ink text-white border-ink shadow-sm'
                    : 'bg-cream border-line text-muted hover:border-ink/40 hover:text-ink'
                }`}
              >
                {filterAll}
              </button>
              {areas.map((a) => (
                <button
                  key={a}
                  onClick={() => setSelArea(selArea === a ? '' : a)}
                  className={`text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-all ${
                    selArea === a
                      ? 'bg-ink text-white border-ink shadow-sm'
                      : 'bg-cream border-line text-muted hover:border-ink/40 hover:text-ink'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Result count */}
      <p className="text-[13px] text-muted mb-5">
        <span className="font-semibold text-ink">{filtered.length}</span> {count}
      </p>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="bg-paper border border-line rounded-2xl p-12 text-center">
          <div className="text-[40px] mb-3">🔍</div>
          <p className="text-muted text-[15px]">{noResults}</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((p) => (
          <article
            key={p.slug}
            className="bg-paper border border-line rounded-2xl overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all group flex flex-col"
          >
            {/* Image */}
            <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none">
              <span className="absolute top-2.5 left-2.5 z-[2] inline-flex items-center gap-1 bg-paper/95 text-ink text-[10.5px] font-semibold px-2 py-[4px] rounded-full shadow-sm">
                {CAT_EMOJI[p.category]} {p.categoryLabel}
              </span>
              <span className="absolute top-2.5 right-2.5 z-[2]">
                <SavePlaceButton slug={p.slug} name={p.name} area={p.area} img={p.img} categoryLabel={p.categoryLabel} size="sm" />
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgProxy(p.img)}
                alt={p.name}
                className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = p.imgFallback }}
              />
            </div>

            {/* Content */}
            <div className="p-4 flex flex-col gap-2 flex-1">
              <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal">
                {p.area}
              </span>
              <Link href={`/places/${p.slug}`}>
                <h3 className="font-serif font-bold text-[16px] leading-snug text-ink hover:text-rose transition-colors line-clamp-2">
                  {p.name}
                </h3>
              </Link>

              <div className="flex gap-2 mt-auto pt-2">
                <a
                  href={p.mapUrl}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 text-center py-2 text-[11.5px] font-semibold rounded-xl bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white transition-all"
                >
                  {openMaps}
                </a>
                <Link
                  href={`/places/${p.slug}`}
                  className="flex-1 text-center py-2 text-[11.5px] font-semibold rounded-xl bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white transition-all"
                >
                  {detail}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
