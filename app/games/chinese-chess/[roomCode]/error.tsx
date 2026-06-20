'use client'

// Room-scoped error boundary for /games/chinese-chess/[roomCode].
//
// Without this, an error thrown while rendering the room escaped past the app-level
// boundary (which only wraps <main>) and the layout's global providers, landing on
// the fatal global-error page that replaces the whole app. Now a room failure is
// contained here: the rest of the app stays intact, the match is recoverable (reset
// re-runs the force-dynamic server component which refetches authoritative state),
// and a stale-build/chunk error triggers exactly one controlled reload.
//
// Result persistence is unaffected by a crash here: moves/resign/draw/timeout are
// all committed by server-side RPCs, so a finished result survives even if this
// client dies — reset/reload restores it from the database.

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { reportClientError } from '@/lib/diagnostics/report'
import { isChunkLoadError, shouldReloadForChunk, normalizeError } from '@/lib/diagnostics/clientError'

export default function ChineseChessRoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('games.chinese_chess.chess_error')
  const [chunkReloading, setChunkReloading] = useState(false)
  const [incidentId, setIncidentId] = useState<string>('')

  const roomCode = useMemo(() => {
    if (typeof window === 'undefined') return null
    const m = window.location.pathname.match(/\/games\/chinese-chess\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]) : null
  }, [])

  useEffect(() => {
    const normalized = normalizeError(error)
    const { incidentId: id } = reportClientError(
      error,
      { route: typeof window !== 'undefined' ? window.location.pathname : null, roomCode },
      'XIANGQI',
    )
    setIncidentId(id)

    if (isChunkLoadError(normalized)) {
      const storage = safeSessionStorage()
      if (shouldReloadForChunk('chunk', roomCode ? `xiangqi:${roomCode}` : 'xiangqi', storage)) {
        setChunkReloading(true)
        window.location.reload()
      }
    }
  }, [error, roomCode])

  if (chunkReloading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-6 py-16">
        <div className="max-w-[420px] w-full text-center">
          <div className="text-[44px] mb-4 animate-pulse">⬇️</div>
          <h1 className="font-serif font-black text-[22px] text-ink mb-2">{t('updating')}</h1>
          <p className="text-[14px] text-muted leading-[1.7]">{t('updating_body')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-[460px] w-full text-center">
        <div className="text-[52px] mb-4">⚠️</div>
        <h1 className="font-serif font-black text-[24px] text-ink mb-3 leading-snug">{t('heading')}</h1>
        <p className="text-[14.5px] text-muted leading-[1.7] mb-7">{t('body')}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
          >
            🔄 {t('retry')}
          </button>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}
            className="inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full bg-paper border border-line text-ink hover:border-rose/40 hover:text-rose transition-all"
          >
            {t('reload_room')}
          </button>
          <a
            href="/games/chinese-chess"
            className="inline-flex items-center justify-center gap-2 font-medium text-[14px] px-7 py-3 rounded-full text-muted hover:text-rose transition-all"
          >
            {t('back_lobby')}
          </a>
        </div>

        {incidentId && (
          <p className="mt-6 text-[11.5px] text-muted/60 font-mono">
            {t('incident')}: {incidentId}
          </p>
        )}
      </div>
    </div>
  )
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}
