import { notFound } from 'next/navigation'
import { getPokerAccess } from './access'

// Master feature-flag chokepoint for every player-facing poker route. When the
// feature is not visible to the viewer (POKER_ENABLED off and not an admin) the
// whole section 404s — the feature does not advertise its own existence. Finer
// per-capability gates (create / public lobby / private / spectator) are applied
// at their own entry points; the security boundary remains RLS + the RPCs.
export default async function PokerLayout({ children }: { children: React.ReactNode }) {
  const { visible } = await getPokerAccess()
  if (!visible) notFound()
  return <>{children}</>
}
