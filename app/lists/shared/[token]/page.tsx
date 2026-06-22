import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'
import { categoryEmoji } from '@/lib/places'
import { getSharedList } from '../../actions'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false } }

export default async function SharedListPage({ params }: { params: { token: string } }) {
  const [t, locale] = await Promise.all([getTranslations('trips'), getLocale()])
  const shared = await getSharedList(params.token)
  if (!shared) notFound()

  const all = (await getAllPlacesFromDb(locale)) ?? staticPlaces
  const map = new Map(all.map((p) => [p.slug, p]))

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <p className="text-[12px] font-semibold uppercase tracking-[1px] text-teal mb-2">{t('shared_readonly')}</p>
      <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] tracking-[-0.4px] text-ink mb-2">{shared.title}</h1>
      {shared.description && <p className="text-[15px] text-muted mb-6">{shared.description}</p>}

      <ul className="space-y-2 mt-4">
        {shared.items.map((it) => {
          const p = map.get(it.place_slug)
          return (
            <li key={it.place_slug} className="bg-paper border border-line rounded-2xl p-3.5 flex items-center gap-3">
              <span className="text-[18px]">{p ? categoryEmoji[p.category] ?? '📍' : '📍'}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/places/${it.place_slug}`} className="font-serif font-bold text-[15.5px] text-ink hover:text-rose">{p?.name ?? it.place_slug}</Link>
                {p?.area && <p className="text-[12px] text-muted">{p.area}</p>}
                {it.note && <p className="text-[13px] text-[#3a2d22] mt-1">{it.note}</p>}
              </div>
              <Link href={`/places/${it.place_slug}`} className="flex-none text-[12.5px] font-semibold text-teal hover:underline">{t('open')}</Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
