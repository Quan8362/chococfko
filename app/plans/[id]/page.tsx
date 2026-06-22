import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getAllPlacesFromDb, places as staticPlaces } from '@/lib/places'
import { toPlaceLite, type PlaceLite } from '@/lib/placeLite'
import { getPlanWithStops } from '../actions'
import PlanEditor from '../PlanEditor'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false } }

export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/plans')

  const [t, tc, locale] = await Promise.all([getTranslations('trips'), getTranslations('categories'), getLocale()])
  const data = await getPlanWithStops(params.id)
  if (!data) notFound()

  const all = (await getAllPlacesFromDb(locale)) ?? staticPlaces
  const placeMap: Record<string, PlaceLite> = Object.fromEntries(
    all.map((p) => [p.slug, toPlaceLite(p, tc(p.category as Parameters<typeof tc>[0]))]),
  )
  const allPlaces = all.map((p) => ({ slug: p.slug, name: p.name, area: p.area }))

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/plans" className="text-[13px] text-muted hover:text-rose">{t('back')}</Link>
      <h1 className="font-serif font-bold text-[clamp(24px,4vw,34px)] tracking-[-0.4px] text-ink mt-2 mb-6">{data.plan.title}</h1>
      <PlanEditor plan={data.plan} stops={data.stops} placeMap={placeMap} allPlaces={allPlaces} />
    </div>
  )
}
