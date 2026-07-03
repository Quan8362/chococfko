import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import { getPokerAccess, pokerAccessSocial } from '../access'
import { fetchMyAchievements, fetchMyMissions } from '../social'
import { dateShort } from '../_eco/format'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('achievements.title')} · ${t('title')}` }
}

const GROUP_ORDER = ['milestone', 'showdown', 'handmade', 'resilience'] as const

export default async function PokerAchievementsPage() {
  const access = await getPokerAccess()
  const showAchievements = pokerAccessSocial(access, 'achievements')
  const showMissions = pokerAccessSocial(access, 'missions')
  // The whole page is dark until at least one of the two flags is on.
  if (!showAchievements && !showMissions) notFound()

  const [t, locale, supabase] = await Promise.all([
    getTranslations('games.poker'),
    getLocale(),
    Promise.resolve(createClient()),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PokerShell>
        <div className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">{t('achievements.title')}</p>
          <p className="mt-2 text-sm text-muted">{t('achievements.sign_in')}</p>
          <Link href="/login?next=/games/poker/achievements" className="mt-4 inline-block rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white">
            {t('profile.sign_in')}
          </Link>
        </div>
      </PokerShell>
    )
  }

  const [achRes, misRes] = await Promise.all([
    showAchievements ? fetchMyAchievements() : Promise.resolve(null),
    showMissions ? fetchMyMissions() : Promise.resolve(null),
  ])

  return (
    <PokerShell>
      <h1 className="mb-1 font-serif text-2xl font-bold">{t('achievements.title')}</h1>

      {showMissions && misRes?.ok && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-serif text-lg font-semibold">{t('missions.title')}</h2>
              <p className="text-sm text-muted">{t('missions.subtitle')}</p>
            </div>
            <span className="whitespace-nowrap text-sm text-muted tabular-nums">
              {t('missions.progress', { completed: misRes.completedCount, total: misRes.totalCount })}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {misRes.missions.map((m) => (
              <li
                key={m.key}
                className={`flex items-start gap-3 rounded-xl border p-3 ${
                  m.completed ? 'border-emerald-300 bg-emerald-50/50' : 'border-line bg-paper'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    m.completed ? 'bg-emerald-500 text-white' : 'bg-rose/10 text-rose'
                  }`}
                >
                  {m.completed ? '✓' : ''}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`missions.item.${m.i18n}.name`)}</p>
                  <p className="text-sm text-muted">{t(`missions.item.${m.i18n}.desc`)}</p>
                  {!m.completed && m.target > 1 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-rose" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">{t('missions.step', { progress: m.progress, target: m.target })}</span>
                    </div>
                  )}
                </div>
                {m.completed && <span className="shrink-0 text-xs font-medium text-emerald-600">{t('missions.done')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showAchievements && achRes?.ok && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-serif text-lg font-semibold">{t('achievements.title')}</h2>
              <p className="text-sm text-muted">{t('achievements.subtitle')}</p>
            </div>
            <span className="whitespace-nowrap text-sm text-muted tabular-nums">
              {t('achievements.progress', { unlocked: achRes.unlockedCount, total: achRes.totalCount })}
            </span>
          </div>

          {GROUP_ORDER.map((group) => {
            const items = achRes.achievements.filter((a) => a.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} className="mb-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t(`achievements.group.${group}`)}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((a) => (
                    <div
                      key={a.key}
                      className={`rounded-xl border p-4 text-center transition-colors ${
                        a.unlocked ? 'border-rose/40 bg-paper' : 'border-line bg-paper/50 opacity-60'
                      }`}
                    >
                      <div
                        aria-hidden
                        className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-lg font-bold ${
                          a.unlocked ? 'bg-rose/10 text-rose' : 'bg-line/60 text-muted'
                        }`}
                      >
                        {a.unlocked ? '✓' : '♠'}
                      </div>
                      <p className="mt-2 text-sm font-medium leading-tight">{t(`achievements.item.${a.i18n}.name`)}</p>
                      <p className="mt-1 text-[11px] leading-tight text-muted">{t(`achievements.item.${a.i18n}.desc`)}</p>
                      {a.unlocked && a.unlockedAt && (
                        <p className="mt-1 text-[10px] text-muted/80">{t('achievements.unlocked_on', { date: dateShort(a.unlockedAt, locale) })}</p>
                      )}
                      {!a.unlocked && <p className="mt-1 text-[10px] uppercase tracking-wide text-muted/70">{t('achievements.locked')}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </PokerShell>
  )
}
