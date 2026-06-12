'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { reportListing } from '../actions'

export default function ReportButton({ listingId }: { listingId: string }) {
  const t = useTranslations('marketplace')
  const [done, setDone] = useState(false)

  async function handle() {
    const reason = window.prompt(t('report_prompt')) ?? ''
    if (reason === null) return
    const fd = new FormData()
    fd.set('listing_id', listingId)
    fd.set('reason', reason)
    await reportListing(fd)
    setDone(true)
  }

  if (done) return <span className="text-[12px] text-muted">{t('report_done')}</span>

  return (
    <button onClick={handle} className="inline-flex items-center gap-1 text-[12px] text-muted/70 hover:text-red-500 transition-colors">
      🚩 {t('report')}
    </button>
  )
}
