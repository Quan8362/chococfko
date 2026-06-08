interface ProgressBarProps {
  total: number
  mastered: number
  review: number
  learning: number
  label?: string
}

export default function ProgressBar({ total, mastered, review, learning, label }: ProgressBarProps) {
  if (total === 0) return null

  const masteredPct = Math.round((mastered / total) * 100)
  const reviewPct   = Math.round((review   / total) * 100)
  const learningPct = Math.round((learning / total) * 100)

  return (
    <div>
      {label && <p className="text-[11px] text-muted mb-1">{label}</p>}
      <div className="flex h-2 rounded-full overflow-hidden bg-line gap-px">
        {mastered > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${masteredPct}%` }}
            title={`Đã nhớ: ${mastered}`}
          />
        )}
        {review > 0 && (
          <div
            className="bg-amber-400 transition-all duration-500"
            style={{ width: `${reviewPct}%` }}
            title={`Cần ôn: ${review}`}
          />
        )}
        {learning > 0 && (
          <div
            className="bg-blue-400 transition-all duration-500"
            style={{ width: `${learningPct}%` }}
            title={`Đang học: ${learning}`}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1">
        {mastered > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {mastered}
          </span>
        )}
        {review > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            {review}
          </span>
        )}
        {learning > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            {learning}
          </span>
        )}
      </div>
    </div>
  )
}
