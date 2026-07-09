import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPokerAccess, pokerAccessTournamentVisible } from './access'
import { BETA_STATUS_MESSAGE_ENV } from '@/lib/games/poker/beta'
import PokerBetaBanner from './_components/PokerBetaBanner'

// Master feature-flag chokepoint for every player-facing poker route. When the
// feature is not visible to the viewer (POKER_ENABLED off and not an admin) the
// whole section 404s — the feature does not advertise its own existence. Finer
// per-capability gates (create / public lobby / private / spectator) are applied
// at their own entry points; the security boundary remains RLS + the RPCs.
//
// A public-rollout viewer (27G-N) is not otherwise "visible" but IS allowed into
// the section so they can reach the Tournament routes; every non-tournament page
// still fails its own capability gate (pokerAccessCan → not visible), so the
// rollout opens the tournament surface ONLY and never a cash capability.
//
// In Alpha mode a fixed, unmissable ALPHA ribbon labels every poker screen so a
// tester always knows this is a pre-release build (test coins, expect bugs).
export default async function PokerLayout({ children }: { children: React.ReactNode }) {
  const acc = await getPokerAccess()
  const { visible, isAlpha, isBeta, betaMaintenance } = acc
  if (!visible && !pokerAccessTournamentVisible(acc)) notFound()
  const t = await getTranslations('games.poker')
  // Ops-controlled service-status message (server-only env). Empty by default. The
  // maintenance switch is resolved server-side in access (it also blocks new joins).
  const statusMessage = process.env[BETA_STATUS_MESSAGE_ENV] || null
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
      {isBeta && !isAlpha && <PokerBetaBanner statusMessage={statusMessage} maintenance={betaMaintenance} />}
      {children}
    </>
  )
}
