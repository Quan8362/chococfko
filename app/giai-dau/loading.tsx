// Skeleton for the tournaments index while the server renders.
export default function Loading() {
  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <div className="h-40 rounded-3xl border border-line bg-cream animate-pulse mb-9" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl border border-line bg-cream animate-pulse" />
        ))}
      </div>
    </div>
  )
}
