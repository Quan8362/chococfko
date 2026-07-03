import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { resolvePokerFlags, POKER_FLAG_ENV } from '@/lib/games/poker/flags'
import { difficultyDistribution } from '@/lib/games/poker/practice'
import type { BotDifficulty } from '@/lib/games/poker/bot/policy'

export const metadata = { title: 'Admin · Poker Practice Bots' }
export const dynamic = 'force-dynamic'

// Read-only ops view for the isolated practice-bot mode. Shows ONLY privacy-safe counters — never
// cards, never the server-only `state` jsonb. There is NO activation control here (and none exists
// anywhere): bots can never be turned on in a human cash table. The master flag is env-only.
async function loadPractice(): Promise<{
  available: boolean
  total: number
  byPhase: Record<string, number>
  byDifficulty: Record<string, number>
}> {
  const admin = createAdminClient()
  try {
    // Never select `state` (holds server-only secrets). Only counters + config difficulty labels.
    const { data, error } = await admin
      .from('poker_practice_games')
      .select('phase, state->config->seats')
      .limit(1000)
    if (error) return { available: false, total: 0, byPhase: {}, byDifficulty: {} }
    const rows = (data ?? []) as Array<{ phase: string; seats?: Array<{ occupant?: { kind?: string; difficulty?: string } }> }>
    const byPhase: Record<string, number> = {}
    const diffs: BotDifficulty[] = []
    for (const r of rows) {
      byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1
      for (const s of r.seats ?? []) {
        if (s.occupant?.kind === 'bot' && s.occupant.difficulty) diffs.push(s.occupant.difficulty as BotDifficulty)
      }
    }
    return { available: true, total: rows.length, byPhase, byDifficulty: difficultyDistribution(diffs) }
  } catch {
    return { available: false, total: 0, byPhase: {}, byDifficulty: {} }
  }
}

export default async function AdminPokerPractice() {
  if (!(await checkIsAdmin())) redirect('/')
  const flags = resolvePokerFlags(process.env)
  const data = await loadPractice()

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 pb-20 sm:px-6">
      <h1 className="font-serif text-2xl text-ink">Poker — Practice Bots (ops)</h1>
      <p className="mt-1 text-sm text-muted">
        Isolated practice mode. Practice chips never touch the real wallet; results feed no ranking,
        achievement, mission, or P&amp;L. Bots can never join a human cash table.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={POKER_FLAG_ENV.practiceBots} value={flags.practiceBots ? 'ON' : 'OFF'} tone={flags.practiceBots ? 'text-amber-700' : 'text-muted'} />
        <Stat label={POKER_FLAG_ENV.bot + ' (cash)'} value="OFF (hard)" tone="text-muted" />
        <Stat label="practice games" value={data.available ? data.total : '—'} />
        <Stat label="table" value={data.available ? 'ready' : 'not applied'} tone={data.available ? 'text-ink' : 'text-muted'} />
      </div>

      <Counts title="By phase" map={data.byPhase} />
      <Counts title="Bot difficulty distribution" map={data.byDifficulty} />

      {!data.available && (
        <p className="mt-4 text-xs text-muted">
          poker_practice_games is not present (migration_poker_practice_bots.sql is PENDING). The
          feature is dark; nothing to show.
        </p>
      )}
    </main>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-3">
      <div className={`text-[20px] font-bold tabular-nums ${tone ?? 'text-ink'}`}>{value}</div>
      <div className="text-[11px] break-all text-muted">{label}</div>
    </div>
  )
}

function Counts({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3">
      <div className="mb-2 text-[12px] font-bold text-ink">{title}</div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-muted">—</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between text-[12px]">
              <span className="text-muted">{k}</span>
              <span className="font-mono text-ink">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
