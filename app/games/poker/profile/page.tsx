import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PokerShell from '../_eco/PokerShell'
import { fetchPokerStats, fetchHandHistory } from '../ecosystem'
import { getPokerAccess, pokerAccessSocial } from '../access'
import { coins, signedCoins, dateShort } from '../_eco/format'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.poker')
  return { title: `${t('profile.title')} · ${t('title')}` }
}

function pct(n: number, d: number, locale: string): string {
  if (d <= 0) return '—'
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n / d)
}

export default async function PokerProfilePage() {
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
          <p className="font-serif text-lg font-semibold">{t('profile.title')}</p>
          <Link href="/login?next=/games/poker/profile" className="mt-3 inline-block rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white">
            {t('profile.sign_in')}
          </Link>
        </div>
      </PokerShell>
    )
  }

  const [{ data: profile }, statsRes, histRes, access] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url, created_at').eq('id', user.id).maybeSingle(),
    fetchPokerStats(),
    fetchHandHistory(8),
    getPokerAccess(),
  ])
  const showSocialLink = pokerAccessSocial(access, 'achievements') || pokerAccessSocial(access, 'missions')
  const s = statsRes.ok ? statsRes.stats : { handsPlayed: 0, handsWon: 0, showdownsReached: 0, showdownsWon: 0, biggestPotWon: 0, netChange: 0 }
  const recent = histRes.ok ? histRes.hands : []

  const cards: { label: string; value: string; note?: string }[] = [
    { label: t('stats.hands_played'), value: coins(s.handsPlayed, locale) },
    { label: t('stats.hands_won'), value: coins(s.handsWon, locale) },
    { label: t('stats.win_rate'), value: pct(s.handsWon, s.handsPlayed, locale), note: t('stats.win_rate_note') },
    { label: t('stats.showdowns'), value: coins(s.showdownsReached, locale) },
    { label: t('stats.showdowns_won'), value: coins(s.showdownsWon, locale) },
    { label: t('stats.showdown_rate'), value: pct(s.showdownsWon, s.showdownsReached, locale) },
    { label: t('stats.biggest_pot'), value: coins(s.biggestPotWon, locale) },
    { label: t('stats.net_change'), value: signedCoins(s.netChange, locale), note: t('stats.net_note') },
  ]

  return (
    <PokerShell>
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-rose/10 text-xl text-rose">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            '♠'
          )}
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold">{profile?.display_name ?? t('profile.anonymous')}</h1>
          {profile?.created_at && (
            <p className="text-sm text-muted">{t('profile.member_since', { date: dateShort(new Date(profile.created_at).getTime(), locale) })}</p>
          )}
        </div>
      </div>

      {showSocialLink && (
        <Link
          href="/games/poker/achievements"
          className="mb-6 flex items-center justify-between rounded-xl border border-rose/30 bg-rose/5 px-4 py-3 hover:border-rose"
        >
          <span className="font-medium text-rose">{t('achievements.open')}</span>
          <span aria-hidden className="text-rose">→</span>
        </Link>
      )}

      <h2 className="mb-3 font-serif text-lg font-semibold">{t('profile.stats_title')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-paper p-4">
            <p className="text-xs text-muted">{c.label}</p>
            <p className="mt-1 font-serif text-xl font-bold tabular-nums">{c.value}</p>
            {c.note && <p className="mt-1 text-[11px] leading-tight text-muted">{c.note}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">{t('profile.recent_title')}</h2>
        <Link href="/games/poker/history" className="text-sm text-rose hover:underline">
          {t('profile.view_history')}
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line bg-paper/60 px-6 py-10 text-center text-muted">
          {t('profile.no_recent')}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recent.map((h) => (
            <li key={h.handId}>
              <Link
                href={`/games/poker/history/${h.handId}`}
                className="flex items-center justify-between rounded-xl border border-line bg-paper p-3 hover:border-rose"
              >
                <span className="font-medium">
                  #{h.handNo} <span className="font-normal text-muted">· {h.tableName}</span>
                </span>
                <span className={`font-medium tabular-nums ${h.result === 'won' ? 'text-emerald-600' : h.result === 'lost' ? 'text-rose' : 'text-muted'}`}>
                  {h.result === 'even' ? t('history.even') : signedCoins(h.net, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PokerShell>
  )
}
