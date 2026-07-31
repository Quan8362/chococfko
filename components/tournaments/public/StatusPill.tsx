import type { TournamentPhase } from '@/lib/tournaments/public/types'

// A small status/phase pill. Presentational + server-safe (no hooks). Conveys state with BOTH an
// icon-dot and a text label (never colour alone) for accessibility.
const PHASE_CLASS: Record<TournamentPhase, string> = {
  ongoing: 'bg-[#e7f6e0] text-[#3f8f1f] border-[#bfe4ac]',
  upcoming: 'bg-[#e8f3f6] text-teal border-[#bfe0e6]',
  completed: 'bg-cream text-muted border-line',
}

const PHASE_DOT: Record<TournamentPhase, string> = {
  ongoing: 'bg-[#3f8f1f]',
  upcoming: 'bg-teal',
  completed: 'bg-muted',
}

export default function StatusPill({ phase, label }: { phase: TournamentPhase; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${PHASE_CLASS[phase]}`}
    >
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${PHASE_DOT[phase]} ${phase === 'ongoing' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}
