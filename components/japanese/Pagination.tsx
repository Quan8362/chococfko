'use client'

import { useTranslations } from 'next-intl'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

function buildRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2) pages.push('…')
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total - 1) pages.push('…')

  pages.push(total)
  return pages
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const t = useTranslations('japanese')

  if (totalPages <= 1) return null

  const pages = buildRange(currentPage, totalPages)

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-8 flex-wrap" aria-label="pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-cream text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ‹ {t('page_prev')}
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`dots-${i}`} className="px-1.5 text-[13px] text-muted select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`min-w-[36px] text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              p === currentPage
                ? 'bg-rose text-white'
                : 'bg-cream text-muted hover:text-ink'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-cream text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {t('page_next')} ›
      </button>
    </nav>
  )
}
