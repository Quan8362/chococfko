import { notFound } from 'next/navigation'
import FxVerifyClient from './FxVerifyClient'

// DEV-ONLY verification harness for the Phase-2 interaction visuals. It mounts the REAL
// ThrowableLayer / ImpactBurst / ReactionControl / PhraseBubbleLayer + the target-selection
// overlay against representative seat geometry, so the throw arcs, impact bursts, target
// rings, pointer-events and responsive layout can be exercised + screenshotted in a browser
// WITHOUT an authenticated live game. Returns 404 in production so it never ships as a route.
export const dynamic = 'force-static'

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <FxVerifyClient />
}
