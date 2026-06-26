import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.chinese_chess')
  return { title: `${t('history_page_title')}` }
}

type HistoryRow = {
  id: string
  room_code: string
  winner: 'red' | 'black' | 'draw' | null
  end_reason: string | null
  player_red: string | null
  player_black: string | null
  player_red_name: string
  player_black_name: string
  move_count: number
  finished_at: string | null
  created_at: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type SearchParams = { filter?: string; page?: string }

export default async function ChineseChessHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, admin] = await Promise.all([
    getTranslations('games.chinese_chess'),
    Promise.resolve(createAdminClient()),
  ])

  const filter = searchParams?.filter ?? 'all'
  const PAGE_SIZE = 20

  // Fetch ALL finished games for this user from the history view
  const { data: allRows } = await admin
    .from('chinese_chess_history')
    .select('id,room_code,winner,end_reason,player_red,player_black,player_red_name,player_black_name,move_count,finished_at,created_at')
    .or(`player_red.eq.${user.id},player_black.eq.${user.id}`)
    .order('finished_at', { ascending: false })

  const rows = (allRows ?? []) as HistoryRow[]

  // Stats
  let wins = 0, losses = 0, draws = 0, asRed = 0, asBlack = 0
  for (const r of rows) {
    const iRed   = r.player_red   === user.id
    const iBlack = r.player_black === user.id
    if (iRed)   asRed++
    if (iBlack) asBlack++
    if (r.winner === 'draw') {
      draws++
    } else if ((r.winner === 'red' && iRed) || (r.winner === 'black' && iBlack)) {
      wins++
    } else {
      losses++
    }
  }
  const total   = rows.length
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

  // Filter
  const filtered = rows.filter(r => {
    if (filter === 'all') return true
    const iRed   = r.player_red   === user.id
    const iBlack = r.player_black === user.id
    if (filter === 'draw') return r.winner === 'draw'
    if (filter === 'win')
      return (r.winner === 'red' && iRed) || (r.winner === 'black' && iBlack)
    if (filter === 'lose')
      return (r.winner === 'red' && iBlack) || (r.winner === 'black' && iRed)
    return true
  })

  const pageNum   = Math.max(1, parseInt(searchParams?.page ?? '1', 10))
  const paginated = filtered.slice(0, pageNum * PAGE_SIZE)
  const hasMore   = filtered.length > paginated.length

  type TKey = Parameters<typeof t>[0]
  const endReasonKey: Record<string, TKey> = {
    checkmate:        'end_checkmate'        as TKey,
    resign:           'end_resign'           as TKey,
    draw:             'end_draw'             as TKey,
    general_captured: 'end_general_captured' as TKey,
    timeout:          'end_timeout'          as TKey,
  }
  const endReasonLabel = (reason: string | null) => {
    if (!reason) return '—'
    return endReasonKey[reason] ? t(endReasonKey[reason]) : reason
  }

  const filters: { key: string; label: TKey }[] = [
    { key: 'all',  label: 'history_filter_all' as TKey },
    { key: 'win',  label: 'history_result_win'  as TKey },
    { key: 'lose', label: 'history_result_lose' as TKey },
    { key: 'draw', label: 'draw'                as TKey },
  ]

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* ── Breadcrumb ── */}
      <Link
        href="/games/chinese-chess"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-8"
      >
        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('breadcrumb_chess')}
      </Link>

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight text-ink mb-2">
          📜 {t('history_page_title')}
        </h1>
      </div>

      {/* ── Stats grid ── */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: t('history_stats_total'),    value: total,        color: 'text-ink' },
            { label: t('history_result_win'),      value: wins,         color: 'text-emerald-600' },
            { label: t('history_result_lose'),     value: losses,       color: 'text-zinc-500' },
            { label: t('draw'),                    value: draws,        color: 'text-amber-600' },
            { label: t('history_stats_win_rate'),  value: `${winRate}%`, color: 'text-teal' },
            { label: t('history_stats_as_red'),    value: asRed,        color: 'text-red-600' },
            { label: t('history_stats_as_black'),  value: asBlack,      color: 'text-zinc-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-paper border border-line rounded-2xl px-4 py-3.5 text-center">
              <p className={`font-bold text-[22px] leading-none mb-1 ${color}`}>{value}</p>
              <p className="text-[11px] text-muted/70 font-medium">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter tabs ── */}
      {total > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {filters.map(({ key, label }) => (
            <Link
              key={key}
              href={`/games/chinese-chess/history?filter=${key}`}
              className={`text-[12.5px] font-semibold px-4 py-1.5 rounded-full border transition-colors ${
                filter === key
                  ? 'bg-rose text-white border-rose'
                  : 'bg-paper border-line text-muted hover:border-rose/40 hover:text-rose'
              }`}
            >
              {t(label)}
            </Link>
          ))}
        </div>
      )}

      {/* ── Game list ── */}
      {paginated.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-14 text-center">
          <p className="text-[42px] mb-3">♟️</p>
          <p className="font-semibold text-[16px] text-ink mb-1">{t('history_empty')}</p>
          <p className="text-[13px] text-muted mb-6">{t('history_empty_sub')}</p>
          <Link
            href="/games/chinese-chess"
            className="inline-flex font-semibold text-[13.5px] px-6 py-2.5 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)]"
          >
            {t('create_btn')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {paginated.map(row => {
            const iRed   = row.player_red   === user.id
            const iBlack = row.player_black === user.id
            const mySide = iRed ? 'red' : 'black'
            const oppName = iRed ? row.player_black_name : row.player_red_name

            let resultKey: 'win' | 'lose' | 'draw'
            if (row.winner === 'draw') {
              resultKey = 'draw'
            } else if ((row.winner === 'red' && iRed) || (row.winner === 'black' && iBlack)) {
              resultKey = 'win'
            } else {
              resultKey = 'lose'
            }

            const resultCls = {
              win:  'bg-emerald-500 text-white border-emerald-500',
              lose: 'bg-zinc-400 text-white border-zinc-400',
              draw: 'bg-amber-400 text-white border-amber-400',
            }[resultKey]

            const resultLabel = {
              win:  t('history_result_win'),
              lose: t('history_result_lose'),
              draw: t('draw'),
            }[resultKey]

            const sideDot = mySide === 'red'
              ? 'bg-red-500'
              : 'bg-zinc-700'
            const sideLabel = mySide === 'red'
              ? t('player_red_label')
              : t('player_black_label')

            return (
              <div
                key={row.id}
                className="bg-paper border border-line rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Result badge */}
                <div className="flex-none">
                  <span className={`inline-flex text-[11.5px] font-bold px-3 py-1 rounded-full border ${resultCls} min-w-[52px] justify-center`}>
                    {resultLabel}
                  </span>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                    {/* My side */}
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className={`w-2 h-2 rounded-full flex-none ${sideDot}`} />
                      {t('history_my_side')}: <span className="font-semibold text-ink">{sideLabel}</span>
                    </span>
                    {/* Opponent */}
                    <span className="text-muted">
                      {t('history_opponent')}: <span className="font-semibold text-ink truncate">{oppName}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[11.5px] text-muted/70">
                    {/* End reason */}
                    <span>{t('result_end_reason_label')}: {endReasonLabel(row.end_reason)}</span>
                    {/* Move count */}
                    <span>{t('move_count_label')}: {row.move_count}</span>
                    {/* Room code */}
                    <span className="font-mono">{row.room_code}</span>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-none text-right">
                  <p className="text-[11px] text-muted/55 whitespace-nowrap">
                    {row.finished_at ? formatDate(row.finished_at) : '—'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Load more ── */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/games/chinese-chess/history?filter=${filter}&page=${pageNum + 1}`}
            className="font-semibold text-[13px] px-7 py-2.5 rounded-2xl border border-rose/30 text-rose hover:bg-rose/5 transition-colors"
          >
            {t('history_load_more')}
          </Link>
        </div>
      )}
    </div>
  )
}
