'use client'

import { useMemo, useState } from 'react'
import FeedbackItem, { type FeedbackView, type ReplyView, type ItemLabels } from './FeedbackItem'
import ConfirmDialog from './ConfirmDialog'
import { deleteFeedbackBulk } from './actions'

export type ListLabels = {
  searchPlaceholder: string
  searchNoResults: string
  selectAll: string
  clearSelection: string
  bulkSelected: string      // template chứa {count}
  bulkDelete: string
  bulkConfirmTitle: string  // template chứa {count}
  bulkConfirmDesc: string
  bulkConfirmYes: string
  bulkCancel: string
  bulkError: string
  bulkDeleting: string
  emptyTitle: string
  emptyDesc: string
}

export default function FeedbackListClient({
  initialItems,
  repliesByFeedback,
  itemLabels,
  listLabels,
}: {
  initialItems: FeedbackView[]
  repliesByFeedback: Record<string, ReplyView[]>
  itemLabels: ItemLabels
  listLabels: ListLabels
}) {
  const [items, setItems] = useState<FeedbackView[]>(initialItems)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      it.name.toLowerCase().includes(q) ||
      (it.email ?? '').toLowerCase().includes(q) ||
      it.message.toLowerCase().includes(q),
    )
  }, [items, query])

  const filteredIds = useMemo(() => filtered.map((i) => i.id), [filtered])
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id)
      } else {
        for (const id of filteredIds) next.add(id)
      }
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function handleSingleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setSelected((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Chỉ xoá những id đang chọn VÀ đang hiển thị (tôn trọng filter/search hiện tại).
  const selectedVisibleIds = useMemo(
    () => filteredIds.filter((id) => selected.has(id)),
    [filteredIds, selected],
  )

  async function handleBulkDelete() {
    setBulkError(null)
    setBulkDeleting(true)
    try {
      const ids = selectedVisibleIds
      const res = await deleteFeedbackBulk(ids)
      if (res.ok) {
        const removed = new Set(ids)
        setItems((prev) => prev.filter((i) => !removed.has(i.id)))
        setSelected((prev) => {
          const next = new Set(prev)
          for (const id of ids) next.delete(id)
          return next
        })
        setConfirmOpen(false)
      } else {
        setBulkError(listLabels.bulkError)
      }
    } catch {
      setBulkError(listLabels.bulkError)
    } finally {
      setBulkDeleting(false)
    }
  }

  const selectedCount = selectedVisibleIds.length
  const bulkBarLabel = listLabels.bulkSelected.replace('{count}', String(selectedCount))
  const bulkConfirmTitle = listLabels.bulkConfirmTitle.replace('{count}', String(selectedCount))

  return (
    <div>
      {/* Search + select-all toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={listLabels.searchPlaceholder}
            aria-label={listLabels.searchPlaceholder}
            className="w-full rounded-full border border-line bg-paper pl-9 pr-4 py-2.5 text-[13.5px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-rose/30 focus:border-rose/60 transition-colors"
          />
        </div>
        {filtered.length > 0 && (
          <label className="flex-none inline-flex items-center gap-2 text-[13px] font-medium text-[#5c4d44] cursor-pointer select-none px-3 py-2 rounded-full border border-line bg-paper hover:bg-rose-soft/50 transition-colors">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-line accent-rose cursor-pointer"
            />
            {listLabels.selectAll}
          </label>
        )}
      </div>

      {/* LIST */}
      {filtered.length === 0 ? (
        query.trim() ? (
          <div className="bg-paper border border-line rounded-2xl py-12 px-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-cream border border-line grid place-items-center text-[20px] mx-auto mb-3">🔍</div>
            <p className="text-[13.5px] text-muted">{listLabels.searchNoResults}</p>
          </div>
        ) : (
          <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">📭</div>
            <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{listLabels.emptyTitle}</h3>
            <p className="text-[13.5px] text-muted max-w-[340px] mx-auto leading-relaxed">{listLabels.emptyDesc}</p>
          </div>
        )
      ) : (
        <div className={`space-y-3 ${selectedCount > 0 ? 'pb-32 sm:pb-28' : 'pb-6'}`}>
          {filtered.map((view) => (
            <FeedbackItem
              key={view.id}
              feedback={view}
              replies={repliesByFeedback[view.id] ?? []}
              labels={itemLabels}
              selected={selected.has(view.id)}
              onToggleSelect={toggleSelect}
              onDeleted={handleSingleDeleted}
            />
          ))}
        </div>
      )}

      {/* BULK ACTION BAR */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-5 pointer-events-none">
          <div className="max-w-[900px] mx-auto pointer-events-auto bg-paper border border-line rounded-2xl shadow-[0_14px_44px_-10px_rgba(36,26,23,0.4)] px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[13.5px] font-semibold text-ink">{bulkBarLabel}</span>
            {bulkError && (
              <span role="alert" className="text-[12.5px] text-red-700">{bulkError}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors"
              >
                {listLabels.clearSelection}
              </button>
              <button
                type="button"
                onClick={() => { setBulkError(null); setConfirmOpen(true) }}
                className="inline-flex items-center gap-1.5 font-semibold text-[13px] px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {listLabels.bulkDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={bulkConfirmTitle}
        description={listLabels.bulkConfirmDesc}
        confirmLabel={bulkDeleting ? listLabels.bulkDeleting : listLabels.bulkConfirmYes}
        cancelLabel={listLabels.bulkCancel}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmOpen(false)}
        pending={bulkDeleting}
      />
    </div>
  )
}
