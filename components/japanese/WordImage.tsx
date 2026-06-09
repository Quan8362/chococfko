'use client'

import { useState } from 'react'
import { clearWordImage } from '@/app/tieng-nhat/image-clear-action'

interface WordImageProps {
  src: string
  alt: string
  creditUrl?: string | null
  source?: string | null
  wordId?: string
}

export default function WordImage({ src, alt, creditUrl, source, wordId }: WordImageProps) {
  const [errored, setErrored] = useState(false)

  if (errored) return null

  return (
    <div className="relative rounded-2xl overflow-hidden bg-cream/40 border border-line/60">
      <img
        src={src}
        alt={alt}
        className="w-full h-[200px] sm:h-[240px] object-cover"
        onError={() => {
          setErrored(true)
          if (wordId) clearWordImage(wordId)
        }}
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
  )
}
