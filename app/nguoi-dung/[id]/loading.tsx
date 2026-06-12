export default function Loading() {
  return (
    <div className="max-w-[820px] mx-auto px-6 py-10 pb-20 animate-pulse">
      <div className="h-4 w-28 bg-line rounded mb-6" />
      <div className="bg-paper border border-line rounded-2xl overflow-hidden mb-8">
        <div className="h-[3px] bg-line" />
        <div className="px-6 sm:px-9 pt-8 pb-7 flex items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-line flex-none" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-7 w-48 bg-line rounded" />
            <div className="h-3.5 w-40 bg-line rounded" />
            <div className="h-9 w-32 bg-line rounded-full mt-4" />
          </div>
        </div>
      </div>
      <div className="h-5 w-40 bg-line rounded mb-5" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="h-20 bg-paper border border-line rounded-2xl" />)}
      </div>
    </div>
  )
}
