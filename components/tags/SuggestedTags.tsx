'use client'

// Presentational list of clickable suggestion chips. Used inside TagInput but
// reusable anywhere a "click to add" tag row is needed.
export default function SuggestedTags({
  suggestions,
  onAdd,
}: {
  suggestions: string[]
  onAdd: (tag: string) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onAdd(tag)}
          className="inline-flex items-center gap-1 max-w-full px-3 py-1.5 rounded-full border border-line bg-cream text-[12.5px] text-ink/80 hover:border-rose/40 hover:text-rose hover:bg-rose/5 transition-colors"
        >
          <span className="text-rose/70 leading-none">+</span>
          <span className="truncate">{tag}</span>
        </button>
      ))}
    </div>
  )
}
