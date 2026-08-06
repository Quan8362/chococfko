// Skeleton for the tournaments index while the server renders. Mirrors the real layout (hero →
// toolbar → status tabs → 3-col card grid) so there is no layout shift when content arrives. Widths
// match TournamentShell size="wide" (max-w-[1280px], 1320px at 2xl).
export default function Loading() {
  return (
    <div className="trn-scope mx-auto w-full max-w-[1280px] px-4 py-8 pb-20 sm:px-6 sm:py-10 lg:px-8 2xl:max-w-[1320px]">
      {/* Hero */}
      <div className="mb-7 h-[132px] animate-pulse rounded-3xl border border-line bg-cream" />
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="h-11 flex-1 animate-pulse rounded-xl border border-line bg-cream" />
        <div className="h-11 w-full animate-pulse rounded-xl border border-line bg-cream sm:w-40" />
      </div>
      {/* Status tabs */}
      <div className="mb-6 flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full border border-line bg-cream" />
        ))}
      </div>
      {/* Card grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-cream" />
        ))}
      </div>
    </div>
  )
}
