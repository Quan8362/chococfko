'use client'

import { useEffect, useState } from 'react'

// Same Japanese (KanjiVG-derived) stroke data CDN used by KanjiStrokeWriter.
const JP_DATA_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0'

// hanzi-writer character bounds: x ∈ [0,1024], y ∈ [-124,900], y-axis points up.
// For a 1024 viewBox the render-group transform is therefore:
const GROUP_TRANSFORM = 'translate(0, 900) scale(1, -1)'

interface StrokeOrderStripProps {
  char: string
  /** Pixel size of each step box. */
  box?: number
}

export default function StrokeOrderStrip({ char, box = 34 }: StrokeOrderStripProps) {
  const [strokes, setStrokes] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStrokes(null)
    setFailed(false)
    fetch(`${JP_DATA_CDN}/${encodeURIComponent(char)}.json`)
      .then(res => {
        if (!res.ok) throw new Error('no data')
        return res.json()
      })
      .then((data: { strokes?: string[] }) => {
        if (cancelled) return
        if (Array.isArray(data.strokes) && data.strokes.length > 0) setStrokes(data.strokes)
        else setFailed(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [char])

  if (failed) {
    return (
      <span
        lang="ja"
        className="inline-flex items-center justify-center rounded-md border border-line bg-cream/40 font-bold text-ink leading-none"
        style={{ width: box, height: box, fontSize: box * 0.6, fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
      >
        {char}
      </span>
    )
  }

  if (!strokes) {
    return <div className="rounded-md border border-line bg-cream/40 animate-pulse" style={{ width: box, height: box }} />
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {strokes.map((_, step) => (
        <svg
          key={step}
          viewBox="0 0 1024 1024"
          width={box}
          height={box}
          className="shrink-0 rounded-md border border-line bg-paper"
          aria-hidden
        >
          <g transform={GROUP_TRANSFORM}>
            {strokes.slice(0, step + 1).map((d, i) => (
              <path key={i} d={d} fill={i === step ? '#c2185b' : '#241a17'} />
            ))}
          </g>
        </svg>
      ))}
    </div>
  )
}
