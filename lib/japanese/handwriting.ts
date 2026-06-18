// Handwriting recognition provider abstraction.
//
// Default provider is Google Input Tools ("ja-t-i0-handwrit"), a public,
// key-free endpoint that turns stroke paths into ranked kanji candidates — the
// same family of service used by many online kanji-draw tools. Because it needs
// no secret, handwriting search works out of the box; set
// `HANDWRITING_PROVIDER=none` to disable it, or implement another provider here.
//
// Strokes are captured as pointer paths (an array of strokes, each an array of
// [x, y] points) rather than a flat image, so recognition quality can improve
// and providers can be swapped without changing the client.

import { ProviderNotConfiguredError } from './providerError'

const INPUT_TOOLS_ENDPOINT =
  'https://inputtools.google.com/request?itc=ja-t-i0-handwrit&app=chococfko'

export type Point = [number, number]
export type Stroke = Point[]

export interface RawCandidate {
  character: string
  score?: number
}

export function handwritingProvider(): string {
  return (process.env.HANDWRITING_PROVIDER || 'google_inputtools').toLowerCase()
}

export function isHandwritingConfigured(): boolean {
  return handwritingProvider() !== 'none'
}

export async function recognizeHandwriting(
  strokes: Stroke[],
  width: number,
  height: number,
): Promise<RawCandidate[]> {
  const p = handwritingProvider()
  if (p === 'none') throw new ProviderNotConfiguredError('handwriting')

  if (p === 'google_inputtools') {
    // Google ink format: one entry per stroke, each [ [x...], [y...], [t...] ].
    const ink = strokes.map(stroke => {
      const xs: number[] = []
      const ys: number[] = []
      for (const [x, y] of stroke) {
        xs.push(Math.round(x))
        ys.push(Math.round(y))
      }
      return [xs, ys, []]
    })

    const body = {
      options: 'enable_pre_space',
      requests: [
        {
          writing_guide: { writing_area_width: width, writing_area_height: height },
          ink,
          language: 'ja',
        },
      ],
    }

    const res = await fetch(INPUT_TOOLS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`handwriting_http_${res.status}`)

    const json = await res.json()
    // Shape: ["SUCCESS", [[ "<id>", ["候","補",...], [scores?], {...} ]]]
    if (!Array.isArray(json) || json[0] !== 'SUCCESS') return []
    const chars: string[] = json[1]?.[0]?.[1] ?? []
    return chars.slice(0, 12).map((character, i) => ({
      character,
      score: Number((1 - i * 0.05).toFixed(2)),
    }))
  }

  throw new ProviderNotConfiguredError(`handwriting:${p}`)
}
