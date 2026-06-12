const STAR = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.07 9.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'

// Read-only star bar. `value` 0..5 (rounded to nearest whole star).
export default function StarsDisplay({ value, className = 'w-3.5 h-3.5' }: { value: number; className?: string }) {
  const full = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`${className} ${i <= full ? 'text-amber-400' : 'text-line'}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  )
}
