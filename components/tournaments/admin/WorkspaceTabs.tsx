'use client'

// Accessible tablist for the admin event workspaces (Prompt 12). Implements the WAI-ARIA tabs
// pattern shared by EventWorkspace and KnockoutWorkspace: role=tablist/tab, aria-selected, roving
// tabindex, and ArrowLeft/Right/Up/Down + Home/End keyboard navigation. The badge dot is decorative
// (aria-hidden) and never the sole carrier of meaning — the tab always has its text label. The active
// panel is a single role=tabpanel wrapper (only the active panel is rendered) referenced by all tabs,
// so aria-controls always resolves to a live element.

import { useRef } from 'react'

export interface WorkspaceTab<T extends string> {
  id: T
  label: string
  show?: boolean
  badge?: boolean
}

export default function WorkspaceTabs<T extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  ariaLabel,
  badgeClassName = 'bg-amber-500',
}: {
  tabs: WorkspaceTab<T>[]
  active: T
  onSelect: (id: T) => void
  idPrefix: string
  ariaLabel: string
  badgeClassName?: string
}) {
  const visible = tabs.filter((x) => x.show !== false)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % visible.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + visible.length) % visible.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = visible.length - 1
    else return
    e.preventDefault()
    const target = visible[next]
    onSelect(target.id)
    refs.current[target.id]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className="flex items-center gap-1 border-b border-line mb-5 -mt-1 overflow-x-auto overflow-y-hidden"
    >
      {visible.map((x, i) => {
        const selected = active === x.id
        return (
          <button
            key={x.id}
            ref={(el) => {
              refs.current[x.id] = el
            }}
            id={`${idPrefix}-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(x.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex-none px-4 py-2.5 text-[13.5px] font-semibold transition-colors rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
              selected ? 'text-rose' : 'text-muted hover:text-ink'
            }`}
          >
            {x.label}
            {x.badge && (
              <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle ${badgeClassName}`} aria-hidden />
            )}
            {selected && <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-rose rounded-full" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
