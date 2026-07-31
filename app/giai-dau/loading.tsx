// Skeleton for the tournaments index while the server renders.
export default function Loading() {
  return (
    <div className="trn-scope w-full max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 pb-20">
      <div className="h-36 rounded-3xl border border-line bg-cream animate-pulse mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl border border-line bg-cream animate-pulse" />
        ))}
      </div>
    </div>
  )
}
