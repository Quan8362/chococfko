// Detail-page skeleton. The parent segment's loading.tsx is the LIST skeleton (hero → toolbar →
// card grid); rendering that here during a hard load or an event-switch navigation would swap the
// detail shell for a differently-shaped placeholder and jump the layout. This mirrors the detail
// shell instead — same TournamentShell width, back link, hero block, event-selector row and tab
// strip — so the hero/action bar/tabs keep their coordinates while the server renders.
export default function Loading() {
  return (
    <div className="trn-scope mx-auto w-full max-w-[1280px] px-4 py-8 pb-20 sm:px-6 sm:py-10 lg:px-8 2xl:max-w-[1320px]">
      {/* Back link */}
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-cream" />
      {/* Hero — same rounded-3xl / min-height footprint as the real header */}
      <div className="mb-6 min-h-[132px] animate-pulse rounded-3xl border border-line bg-cream" />
      {/* Event selector row */}
      <div className="mb-5">
        <div className="mb-1.5 h-3 w-28 animate-pulse rounded bg-cream" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-40 animate-pulse rounded-xl border border-line bg-cream" />
          ))}
        </div>
      </div>
      {/* Tab strip */}
      <div className="mb-6 flex gap-1 border-b border-line pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded bg-cream" />
        ))}
      </div>
      {/* Panel */}
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-cream" />
    </div>
  )
}
