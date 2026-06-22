'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { REPORT_KINDS } from '@/lib/placeQa'
import { submitReport } from '@/app/places/qa-actions'

/** "Report changed info" → structured report into the admin review queue. */
export default function PlaceReport({ slug, variant = 'button' }: { slug: string; variant?: 'button' | 'menu' }) {
  const t = useTranslations('place_qa')
  const { loggedIn } = useSavedPlaces()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<string>(REPORT_KINDS[0])
  const [detail, setDetail] = useState('')
  const [sent, setSent] = useState(false)
  const [, start] = useTransition()

  const submit = () => start(async () => { const r = await submitReport(slug, kind, detail); if (r.ok) { setSent(true); setDetail('') } })

  const trigger = variant === 'menu'
    ? <button type="button" onClick={() => { setOpen(true); setSent(false) }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream text-left">⚠️ {t('report_title')}</button>
    : <button type="button" onClick={() => { setOpen(true); setSent(false) }} className="text-[13px] font-semibold text-muted hover:text-rose">⚠️ {t('report_title')}</button>

  return (
    <>
      {trigger}
      {open && (
        <div className="fixed inset-0 z-[200] grid place-items-center p-5">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-paper border border-line rounded-2xl p-5 max-w-[400px] w-full shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif font-bold text-[17px] text-ink">{t('report_title')}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="w-7 h-7 grid place-items-center rounded-full hover:bg-cream">✕</button>
            </div>

            {sent ? (
              <p className="text-[14px] text-emerald-700 py-4 text-center">{t('report_sent')}</p>
            ) : !loggedIn ? (
              <div className="text-center py-5">
                <p className="text-[13.5px] text-muted mb-4">{t('login_to_ask')}</p>
                <Link href="/login" className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white">{t('login')}</Link>
              </div>
            ) : (
              <>
                <p className="text-[12.5px] text-muted mb-3">{t('report_intro')}</p>
                <label className="block text-[12px] text-muted mb-1">{t('report_kind_label')}</label>
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white mb-3">
                  {REPORT_KINDS.map((k) => <option key={k} value={k}>{t(`rk_${k}` as 'rk_other')}</option>)}
                </select>
                <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={t('report_detail_ph')} rows={3} className="w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white resize-y" />
                <p className="text-[11.5px] text-muted mt-2">{t('report_queue_note')}</p>
                <button type="button" onClick={submit} className="mt-3 w-full font-semibold text-[14px] py-2.5 rounded-full bg-rose text-white">{t('report_submit')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
