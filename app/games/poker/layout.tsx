import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPokerAccess } from './access'

// Master feature-flag chokepoint for every player-facing poker route. When the
// feature is not visible to the viewer (POKER_ENABLED off and not an admin) the
// whole section 404s — the feature does not advertise its own existence. Finer
// per-capability gates (create / public lobby / private / spectator) are applied
// at their own entry points; the security boundary remains RLS + the RPCs.
//
// In Alpha mode a fixed, unmissable ALPHA ribbon labels every poker screen so a
// tester always knows this is a pre-release build (test coins, expect bugs).
export default async function PokerLayout({ children }: { children: React.ReactNode }) {
  const { visible, isAlpha } = await getPokerAccess()
  if (!visible) notFound()
  const t = await getTranslations('games.poker')
  return (
    <>
      {isAlpha && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-3 left-1/2 z-[120] -translate-x-1/2 select-none rounded-full border border-amber-400/60 bg-amber-500/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-black shadow-lg"
        >
          {t('alpha.badge')}
        </div>
      )}
      {children}
    </>
  )
}
