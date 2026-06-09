'use client'

import { useState } from 'react'

interface WordImageProps {
  src: string
  alt: string
  creditUrl?: string | null
  source?: string | null
  wordId?: string
  label?: string
}

export default function WordImage({ src, alt, creditUrl, source, label }: WordImageProps) {
  const [errored, setErrored] = useState(false)

  if (errored) return null

  return (
    <div className="mb-6">
      {label && (
        <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-3">{label}</p>
      )}
      <div className="relative rounded-2xl overflow-hidden bg-cream/40 border border-line/60">
        <img
          src={src}
          alt={alt}
          className="w-full h-[200px] sm:h-[240px] object-cover"
          onError={() => setErrored(true)}
        />
        {creditUrl && (
          <a
            href={creditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 text-[10px] text-white/80 bg-black/35 px-2 py-0.5 rounded-full hover:text-white transition-colors"
          >
            {source === 'pexels' ? 'Pexels' : 'Pixabay'}
          </a>
        )}
      </div>
    </div>
  )
}
