import { NextRequest } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import {
  recognizeHandwriting,
  isHandwritingConfigured,
  type Stroke,
} from '@/lib/japanese/handwriting'
import { isProviderNotConfigured } from '@/lib/japanese/providerError'
import { rateLimit, clientKey } from '@/lib/japanese/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_STROKES = 60
const MAX_POINTS_PER_STROKE = 600

interface Candidate {
  character: string
  confidence?: number
  reading?: string
  meaning_vi?: string
  meaning_en?: string
  jlpt?: string
  url: string
}

export async function POST(req: NextRequest) {
  // Soft abuse guard (see lib/japanese/rateLimit.ts for the serverless caveat).
  const rl = rateLimit(clientKey(req, 'jp-handwriting'), 40, 60_000)
  if (!rl.ok) {
    return Response.json(
      { candidates: [], error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  if (!isHandwritingConfigured()) {
    return Response.json({ candidates: [], configured: false })
  }

  let payload: { strokes?: unknown; width?: unknown; height?: unknown }
  try {
    payload = await req.json()
  } catch {
    return Response.json({ candidates: [], error: 'invalid_body' }, { status: 400 })
  }

  const strokes = sanitizeStrokes(payload.strokes)
  const width = clampInt(payload.width, 1, 4000, 300)
  const height = clampInt(payload.height, 1, 4000, 300)
  if (strokes.length === 0) {
    return Response.json({ candidates: [], configured: true })
  }

  let raw
  try {
    raw = await recognizeHandwriting(strokes, width, height)
  } catch (e) {
    if (isProviderNotConfigured(e)) return Response.json({ candidates: [], configured: false })
    return Response.json({ candidates: [], configured: true, error: 'recognize_failed' }, { status: 502 })
  }

  const candidates = await enrich(raw.map(r => ({ character: r.character, confidence: r.score })))
  return Response.json({ candidates, configured: true })
}

/** Look up reading / meaning / JLPT for recognized characters (best effort). */
async function enrich(
  base: { character: string; confidence?: number }[],
): Promise<Candidate[]> {
  const chars = base.map(b => b.character)
  let byChar = new Map<string, { jlpt?: string; reading?: string; vi?: string; en?: string }>()

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && chars.length) {
      const supabase = createPublicClient()
      const { data } = await supabase
        .from('japanese_kanji')
        .select('character,jlpt_level,onyomi,kunyomi,meanings')
        .in('character', chars)
        .eq('is_published', true)

      byChar = new Map(
        (data ?? []).map(k => {
          const readings = [...(k.onyomi ?? []), ...(k.kunyomi ?? [])].filter(Boolean)
          const meaning = Array.isArray(k.meanings) ? k.meanings[0] : undefined
          return [
            k.character as string,
            {
              jlpt: k.jlpt_level ?? undefined,
              reading: readings.length ? readings.slice(0, 4).join('、') : undefined,
              vi: meaning?.vi || undefined,
              en: meaning?.en || undefined,
            },
          ]
        }),
      )
    }
  } catch {
    // Enrichment is optional — fall back to bare characters.
  }

  return base.map(b => {
    const info = byChar.get(b.character)
    return {
      character: b.character,
      confidence: b.confidence,
      reading: info?.reading,
      meaning_vi: info?.vi,
      meaning_en: info?.en,
      jlpt: info?.jlpt,
      url: `/japanese/dictionary?q=${encodeURIComponent(b.character)}`,
    }
  })
}

function sanitizeStrokes(input: unknown): Stroke[] {
  if (!Array.isArray(input)) return []
  const out: Stroke[] = []
  for (const stroke of input.slice(0, MAX_STROKES)) {
    if (!Array.isArray(stroke)) continue
    const pts: [number, number][] = []
    for (const p of stroke.slice(0, MAX_POINTS_PER_STROKE)) {
      if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        pts.push([Number(p[0]), Number(p[1])])
      }
    }
    if (pts.length) out.push(pts)
  }
  return out
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
