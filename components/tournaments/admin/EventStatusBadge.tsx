import type { EventStatus } from '@/lib/tournaments/admin/types'

// Presentational event-status pill. Label is passed in already localized so this stays a plain
// server-renderable component with no i18n dependency of its own.
const STYLES: Record<EventStatus, string> = {
  setup: 'bg-cream text-[#5c4d44] border-line',
  group_stage: 'bg-amber-50 text-amber-700 border-amber-200',
  group_stage_completed: 'bg-amber-50 text-amber-700 border-amber-200',
  knockout_ready: 'bg-teal-soft text-teal border-teal/25',
  knockout_running: 'bg-teal-soft text-teal border-teal/25',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
}

export default function EventStatusBadge({ status, label }: { status: EventStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-[3px] rounded-full border ${STYLES[status]}`}
    >
      {label}
    </span>
  )
}
