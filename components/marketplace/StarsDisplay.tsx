const STAR = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.07 9.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'

// Read-only star bar. `value` 0..5 — mỗi sao tô vàng theo đúng tỉ lệ phần lẻ
// (vd. 4.5 → 4 sao đầy + 1 nửa sao; 4.3 → tô 30% sao thứ 5).
export default function StarsDisplay({ value, className = 'w-3.5 h-3.5' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <span key={i} className="relative inline-block leading-none">
            <svg className={`${className} text-line`} fill="currentColor" viewBox="0 0 20 20">
              <path d={STAR} />
            </svg>
            {fill > 0 && (
              <span className="absolute top-0 left-0 h-full overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg className={`${className} max-w-none text-amber-400`} fill="currentColor" viewBox="0 0 20 20">
                  <path d={STAR} />
                </svg>
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
