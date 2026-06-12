export default function Loading() {
  return (
    <div className="pb-20">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-6 pt-6 animate-pulse">
        <div className="h-4 w-28 bg-line rounded mb-5" />
        <div className="grid lg:grid-cols-[1fr_380px] gap-7 items-start">
          <div>
            <div className="aspect-[4/3] rounded-2xl bg-line" />
            <div className="flex gap-2 mt-3">
              {[0, 1, 2].map(i => <div key={i} className="w-16 h-16 rounded-lg bg-line" />)}
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-paper border border-line rounded-2xl p-5 space-y-3">
              <div className="h-8 w-32 bg-line rounded" />
              <div className="h-4 w-48 bg-line rounded" />
              <div className="h-2 w-full bg-line rounded-full mt-3" />
            </div>
            <div className="bg-paper border border-line rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-line" />
                <div className="h-4 w-28 bg-line rounded" />
              </div>
              <div className="h-11 w-full bg-line rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
