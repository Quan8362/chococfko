import { NextResponse } from 'next/server'
import { POKER_PROTOCOL_VERSION } from '@/lib/games/poker/pwa/version'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Lightweight, unauthenticated version probe. Echoes the SERVER's current build id (baked as
// NEXT_PUBLIC_BUILD_ID / Next's build id — see next.config.mjs) plus the poker action-protocol
// version, so a running client can detect that a newer deploy is live and — between hands — offer
// the user a controlled reload. Returns ONLY these two public scalars; no secrets, no user data.
// `no-store` so an intermediary never serves a stale build id and mask a real update.
export function GET() {
  return NextResponse.json(
    {
      buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
      pokerProtocol: POKER_PROTOCOL_VERSION,
    },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  )
}
