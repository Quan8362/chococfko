export default function Loading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-56 bg-line rounded mb-5" />
      <div className="grid grid-cols-[200px_1fr] gap-0 border border-line rounded-2xl overflow-hidden bg-paper min-h-[480px]">
        <div className="border-r border-line p-3 space-y-2">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-line/70 rounded-lg" />)}
        </div>
        <div className="p-4 flex flex-col gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`flex gap-2 ${i % 2 ? 'justify-end' : ''}`}>
              {i % 2 === 0 && <div className="w-8 h-8 rounded-full bg-line flex-none" />}
              <div className={`h-12 rounded-2xl bg-line/70 ${i % 2 ? 'w-40' : 'w-52'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
