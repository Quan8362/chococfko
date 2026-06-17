// Symmetric 5-point star (golden-ratio points, centered in a 0..20 box) so it
// renders perfectly even — the previous Heroicons path was visually lopsided.
export const STAR_PATH =
  'M10 0.7 L 12.088 7.126 L 18.845 7.126 L 13.379 11.098 L 15.466 17.524 L 10 13.553 L 4.534 17.524 L 6.621 11.098 L 1.155 7.126 L 7.912 7.126 Z'

// Read-only star bar. `value` 0..5 — mỗi sao tô vàng theo đúng tỉ lệ phần lẻ
// (vd. 4.5 → 4 sao đầy + 1 nửa sao; 4.3 → tô 30% sao thứ 5).
export default function StarsDisplay({ value, className = 'w-3.5 h-3.5' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <span key={i} className="relative inline-block leading-none shrink-0">
            <svg className={`${className} text-line shrink-0`} fill="currentColor" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet">
              <path d={STAR_PATH} />
            </svg>
            {fill > 0 && (
              <span className="absolute top-0 left-0 h-full overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg className={`${className} max-w-none shrink-0 text-amber-400`} fill="currentColor" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet">
                  <path d={STAR_PATH} />
                </svg>
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
