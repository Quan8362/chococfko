'use client'

// Ops service-status / maintenance strip for poker screens, mounted while
// POKER_CLOSED_BETA_ENABLED is on (server-gated in layout.tsx). Its only job is to
// surface an ops-controlled maintenance / service-status message to every player;
// maintenance takes priority. It renders NOTHING when there is no active message,
// so it never adds chrome or spacing in the normal (launched) state. All copy is
// i18n and it shows nothing sensitive.

import { useTranslations } from 'next-intl'

interface Props {
  // Optional ops messages resolved server-side from env and passed down.
  statusMessage?: string | null
  maintenance?: boolean
}

export default function PokerBetaBanner({ statusMessage, maintenance }: Props) {
  const t = useTranslations('games.poker.beta')

  // Maintenance / service-status strip (ops-controlled). Maintenance takes priority.
  if (maintenance) {
    return (
      <div role="alert" className="sticky top-0 z-[118] w-full bg-amber-500 px-3 py-1.5 text-center text-[12px] font-semibold text-black">
        {statusMessage?.trim() || t('maintenance')}
      </div>
    )
  }
  if (statusMessage?.trim()) {
    return (
      <div role="status" className="sticky top-0 z-[118] w-full bg-sky-50 px-3 py-1.5 text-center text-[12px] text-sky-900">
        {statusMessage}
      </div>
    )
  }
  return null
}
