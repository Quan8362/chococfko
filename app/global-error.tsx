'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global error]', error)
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
            <div style={{ fontSize: 56, marginBottom: 20 }}>⚠️</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#241a17', marginBottom: 12 }}>
              Có lỗi nghiêm trọng
            </h1>
            <p style={{ fontSize: 15, color: '#8c7c70', lineHeight: 1.7, marginBottom: 28 }}>
              Ứng dụng gặp sự cố không thể tiếp tục.
              <br />
              Vui lòng thử tải lại trang.
            </p>
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
          </div>
        </div>
      </body>
    </html>
  )
}
