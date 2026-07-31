import type { TournamentStatus } from '@/lib/tournaments/admin/types'

// Presentational status pill. Label text is passed in (already localized) so this stays a plain
// server-renderable component with no i18n dependency of its own.
const STYLES: Record<TournamentStatus, string> = {
  draft: 'bg-cream text-[#5c4d44] border-line',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-neutral-100 text-neutral-500 border-neutral-200',
}

const EMOJI: Record<TournamentStatus, string> = {
  draft: '📝',
  published: '✅',
  completed: '🏆',
  archived: '📦',
}

export default function StatusBadge({
  status,
  label,
}: {
  status: TournamentStatus
  label: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-[4px] rounded-full border ${STYLES[status]}`}
    >
      <span className="text-[11px]">{EMOJI[status]}</span>
      {label}
    </span>
  )
}
