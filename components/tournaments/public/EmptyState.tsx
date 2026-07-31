// Shared empty-state panel for tabs with no data yet. Missing data is a normal "not started" state,
// never an error.
export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="bg-cream border border-line rounded-2xl py-12 px-6 text-center">
      <div className="w-11 h-11 rounded-xl bg-paper border border-line flex items-center justify-center mx-auto mb-3 text-muted/50">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-[13.5px] font-medium text-ink mb-1">{title}</p>
      {hint && <p className="text-[12.5px] text-muted max-w-[360px] mx-auto">{hint}</p>}
    </div>
  )
}
