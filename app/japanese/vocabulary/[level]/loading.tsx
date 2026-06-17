import LoadingState from '@/components/japanese/LoadingState'

export default function VocabularyLevelLoading() {
  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-1.5 mb-8">
        <div className="h-3.5 w-20 bg-line rounded animate-pulse" />
        <span className="text-muted/40">/</span>
        <div className="h-3.5 w-20 bg-line rounded animate-pulse" />
        <span className="text-muted/40">/</span>
        <div className="h-3.5 w-8 bg-line rounded animate-pulse" />
      </div>
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-9 w-24 bg-line rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-line/60 rounded animate-pulse" />
      </div>
      <LoadingState count={8} variant="grammar" />
    </div>
  )
}
