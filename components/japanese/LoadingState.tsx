interface LoadingStateProps {
  count?: number
  variant?: 'kanji' | 'grammar'
}

export default function LoadingState({ count = 6, variant = 'grammar' }: LoadingStateProps) {
  return (
    <div className={`grid gap-4 ${variant === 'kanji' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-paper border border-line rounded-2xl p-5 animate-pulse">
          {variant === 'kanji' ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-cream rounded-xl" />
                <div className="w-10 h-5 bg-cream rounded-full" />
              </div>
              <div className="h-4 bg-cream rounded w-3/4 mb-3" />
              <div className="h-3 bg-cream rounded w-1/2 mb-2" />
              <div className="h-3 bg-cream rounded w-2/3" />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between mb-3">
                <div className="h-6 bg-cream rounded w-1/2" />
                <div className="w-10 h-5 bg-cream rounded-full" />
              </div>
              <div className="h-4 bg-cream rounded w-3/4 mb-3" />
              <div className="h-16 bg-cream rounded-lg mb-3" />
              <div className="h-3 bg-cream rounded w-full mb-1" />
              <div className="h-3 bg-cream rounded w-5/6" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
