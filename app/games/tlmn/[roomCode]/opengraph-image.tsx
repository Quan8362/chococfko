import { ImageResponse } from 'next/og'

// Branded, room-specific OG image for invite-link unfurls (Zalo / Messenger / etc.).
// Deliberately dependency-free: the only dynamic text is the room CODE (ASCII) so it
// renders reliably with the built-in font — no remote fonts, no DB read, no avatars.
// The localized invite headline ("{host} mời bạn chơi…") lives in the page metadata
// title, which unfurlers render alongside this image.
// TODO(dynamic-og): paint the host name + avatar into the image (needs a VI/CJK font).

export const runtime = 'edge'
export const alt = 'Tiến Lên Miền Nam · Chợ Cóc FKO'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage({ params }: { params: { roomCode: string } }) {
  const code = (params.roomCode || '').toUpperCase().slice(0, 8)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FDF6EF 0%, #fbe6f1 100%)',
          fontFamily: 'sans-serif',
          padding: '64px',
        }}
      >
        <div style={{ display: 'flex', gap: '18px', fontSize: 96, lineHeight: 1 }}>
          <span style={{ color: '#1f1a17' }}>♠</span>
          <span style={{ color: '#D6006C' }}>♥</span>
          <span style={{ color: '#D6006C' }}>♦</span>
          <span style={{ color: '#1f1a17' }}>♣</span>
        </div>

        <div style={{ display: 'flex', marginTop: 30, fontSize: 58, fontWeight: 800, color: '#1f1a17', letterSpacing: 2 }}>
          TIEN LEN MIEN NAM
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 44,
            padding: '22px 56px',
            borderRadius: 28,
            background: '#D6006C',
            color: '#ffffff',
            fontSize: 84,
            fontWeight: 900,
            letterSpacing: 14,
          }}
        >
          {code}
        </div>

        <div style={{ display: 'flex', marginTop: 40, fontSize: 30, color: '#8a6f63', fontWeight: 600 }}>
          chococfko.com
        </div>
      </div>
    ),
    size,
  )
}
