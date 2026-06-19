'use client'

import type { Scope } from '@/lib/access'

// Scope picker shown on posting forms for FKO-internal members only.
// Community users never render this (they always post to community).
export default function ScopeSelector({
  value,
  onChange,
  communityLabel,
  internalLabel,
  hint,
  legend,
}: {
  value: Scope
  onChange: (s: Scope) => void
  communityLabel: string
  internalLabel: string
  hint: string
  legend: string
}) {
  const opts: { key: Scope; label: string }[] = [
    { key: 'community', label: communityLabel },
    { key: 'fko_internal', label: internalLabel },
  ]
  return (
    <div className="rounded-2xl border border-line bg-cream/40 px-5 py-4">
      <p className="text-[13px] font-semibold text-ink mb-2.5">{legend}</p>
      <div className="flex gap-2.5">
        {opts.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`flex-1 px-4 py-2.5 rounded-xl border text-[13.5px] font-semibold transition-all ${
              value === o.key
                ? 'border-rose bg-rose/5 text-rose'
                : 'border-line bg-paper text-muted hover:border-rose/30'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted mt-2.5 leading-relaxed">{hint}</p>
    </div>
  )
}
