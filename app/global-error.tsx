'use client'

import { useEffect, useState } from 'react'
import { reportClientError } from '@/lib/diagnostics/report'
import { isChunkLoadError, shouldReloadForChunk, normalizeError } from '@/lib/diagnostics/clientError'

// Last-resort boundary that replaces the entire app (root layout included), so it
// must be fully self-contained: no i18n provider, no app chrome. It now (a) reports
// the real error instead of silently swallowing it, and (b) recovers from a
// stale-build/chunk error with a single controlled reload. Ordinary runtime errors
// are NOT auto-reloaded.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [incidentId, setIncidentId] = useState<string>('')
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    const normalized = normalizeError(error)
    const { incidentId: id } = reportClientError(error, {}, 'APP')
    setIncidentId(id)

    if (isChunkLoadError(normalized)) {
      const storage = safeSessionStorage()
      if (shouldReloadForChunk('chunk', 'global', storage)) {
        setReloading(true)
        try { window.location.reload() } catch { /* ignore */ }
      }
    }
  }, [error])

  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#faf4ea' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>{reloading ? '⬇️' : '⚠️'}</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#241a17', marginBottom: 12 }}>
              {reloading ? 'Đang cập nhật…' : 'Có lỗi nghiêm trọng'}
            </h1>
            <p style={{ fontSize: 15, color: '#8c7c70', lineHeight: 1.7, marginBottom: 28 }}>
              {reloading ? (
                <>Đang tải phiên bản mới nhất.</>
              ) : (
                <>
                  Ứng dụng gặp sự cố không thể tiếp tục.
                  <br />
                  Vui lòng thử tải lại trang.
                </>
              )}
            </p>
            {!reloading && (
              <button
                onClick={reset}
                style={{
                  padding: '12px 28px',
                  borderRadius: 999,
                  background: '#c2185b',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🔄 Tải lại
              </button>
            )}
            {!reloading && incidentId && (
              <p style={{ marginTop: 24, fontSize: 11.5, color: 'rgba(140,124,112,0.6)', fontFamily: 'monospace' }}>
                Mã sự cố: {incidentId}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}
