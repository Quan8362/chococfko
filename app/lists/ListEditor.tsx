'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { PlaceLite } from '@/lib/placeLite'
import { moveItem } from '@/lib/planning'
import { openStatus } from '@/lib/placeOpenNow'
import {
  renameList, setListShareable, addPlaceToList, removeFromList, reorderList,
  type ListRow, type ListItemRow,
} from './actions'

interface Props {
  list: ListRow
  items: ListItemRow[]
  placeMap: Record<string, PlaceLite>
  allPlaces: { slug: string; name: string; area: string }[]
}

export default function ListEditor({ list, items, placeMap, allPlaces }: Props) {
  const t = useTranslations('trips')
  const td = useTranslations('place_detail')
  const tm = useTranslations('map_explore')
  const router = useRouter()
  const [, start] = useTransition()

  const [title, setTitle] = useState(list.title)
  const [desc, setDesc] = useState(list.description ?? '')
  const [shareable, setShareable] = useState(list.is_shareable)
  const [shareNotes, setShareNotes] = useState(list.share_notes)
  const [token, setToken] = useState(list.share_token)
  const [order, setOrder] = useState(items.map((i) => i.place_slug))
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const shareUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/lists/shared/${token}` : ''

  const saveMeta = () => start(async () => { await renameList(list.id, title, desc) })
  const toggleShare = (on: boolean) => start(async () => { const r = await setListShareable(list.id, on, shareNotes); setShareable(on); setToken(r.token) })
  const toggleNotes = (on: boolean) => start(async () => { setShareNotes(on); if (shareable) { const r = await setListShareable(list.id, true, on); setToken(r.token) } })

  const move = (from: number, to: number) => {
    const next = moveItem(order, from, to); setOrder(next)
    start(async () => { await reorderList(list.id, next) })
  }
  const remove = (slug: string) => { setOrder((o) => o.filter((s) => s !== slug)); start(async () => { await removeFromList(list.id, slug); router.refresh() }) }
  const add = (slug: string) => { if (order.includes(slug)) return; setOrder((o) => [...o, slug]); setQuery(''); start(async () => { await addPlaceToList(list.id, slug); router.refresh() }) }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return []
    return allPlaces.filter((p) => p.name.toLowerCase().includes(q) && !order.includes(p.slug)).slice(0, 8)
  }, [query, allPlaces, order])

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
      <div>
        {/* Add place */}
        <div className="relative mb-5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('add_place_ph')}
            className="w-full text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-paper" />
          {matches.length > 0 && (
            <ul className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] bg-paper border border-line rounded-xl shadow-card-hover p-1.5">
              {matches.map((p) => (
                <li key={p.slug}><button type="button" onClick={() => add(p.slug)} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-cream">{p.name} <span className="text-muted">· {p.area}</span></button></li>
              ))}
            </ul>
          )}
        </div>

        {order.length === 0 ? (
          <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('no_items')}</p>
        ) : (
          <ul className="space-y-2">
            {order.map((slug, i) => {
              const p = placeMap[slug]
              const st = p ? openStatus(p.openingHours, p.closedDays, { temporaryStatus: p.temporaryStatus }) : 'hours_unknown'
              return (
                <li key={slug} className="bg-paper border border-line rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-[18px]">{p?.emoji ?? '📍'}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/places/${slug}`} className="font-serif font-bold text-[15px] text-ink hover:text-rose">{p?.name ?? slug}</Link>
                    <p className="text-[12px] text-muted">{p?.area}{st !== 'hours_unknown' ? ` · ${tm(`state_${st}` as 'state_open')}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t('move_up')} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label={t('move_down')} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => remove(slug)} aria-label={t('remove')} className="w-7 h-7 grid place-items-center rounded-lg border border-line text-muted hover:text-rose">✕</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Sidebar: meta + privacy */}
      <aside className="space-y-4">
        <div className="bg-paper border border-line rounded-2xl p-4 space-y-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} className="w-full text-[15px] font-semibold px-3 py-2 border border-line rounded-lg bg-white" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveMeta} placeholder={t('desc_ph')} rows={2} className="w-full text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white resize-y" />
        </div>

        <div className="bg-paper border border-line rounded-2xl p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[1px] text-muted mb-2">{t('privacy')}</p>
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" className="accent-rose" checked={shareable} onChange={(e) => toggleShare(e.target.checked)} />
            {t('make_shareable')}
          </label>
          {shareable && (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer text-muted">
                <input type="checkbox" className="accent-rose" checked={shareNotes} onChange={(e) => toggleNotes(e.target.checked)} />
                {t('include_notes')}
              </label>
              <p className="text-[11.5px] text-muted">{t('share_note')}</p>
              {shareUrl && (
                <div className="flex gap-2">
                  <input readOnly value={shareUrl} className="flex-1 text-[12px] px-2.5 py-2 border border-line rounded-lg bg-cream" />
                  <button type="button" onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
                    className="text-[12.5px] font-semibold px-3 py-2 rounded-lg bg-rose text-white whitespace-nowrap">{copied ? t('link_copied') : t('copy_link')}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
