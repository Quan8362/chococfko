'use client'

import { useState } from 'react'
import { imgProxy } from '@/lib/avatar'

export default function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const list = (images.length ? images : []).map(imgProxy)

  if (list.length === 0) {
    return <div className="aspect-[4/3] rounded-2xl bg-cream border border-line grid place-items-center text-5xl opacity-30">🛒</div>
  }

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="block w-full aspect-[4/3] rounded-2xl overflow-hidden border border-line bg-cream cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[active]} alt={title} className="w-full h-full object-contain" />
        </button>
        {list.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {list.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setActive(i)}
                className={`flex-none w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${i === active ? 'border-rose' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-ink/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[active]} alt={title} className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/15 text-white text-xl hover:bg-white/25"
          >✕</button>
        </div>
      )}
    </>
  )
}
