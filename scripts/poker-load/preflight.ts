// ── Poker load-test PREFLIGHT — validate a profile + safety before any run (no DB) ──────
//
// Prints the resolved profile, computed client/command budget, guardrail check, and target
// safety verdict. Runs entirely offline (no Supabase, no Playwright) so an operator can dry-run
// the plan and see exactly what a real run WOULD do before spending anything.
//
// Run:  POKER_LOAD_PROFILE=target node scripts/poker-load/preflight.ts
import {
  resolveProfile,
  clientCount,
  assertWithinGuardrails,
  resolveTarget,
  assertSafeTarget,
  GUARDRAILS,
  shouldStop,
} from './config.ts'

function main(): void {
  const p = resolveProfile()
  const seated = p.tables * p.playersPerTable
  const clients = clientCount(p)
  const est = estimateActionRate(p)

  console.log(`\nPoker load-test preflight — profile "${p.name}"`)
  console.log(`  ${p.description}\n`)
  console.log(`  tables ................. ${p.tables}`)
  console.log(`  seated players ......... ${seated}  (${p.playersPerTable}/table)`)
  console.log(`  spectators ............. ${p.tables * p.spectatorsPerTable}`)
  console.log(`  lobby viewers .......... ${p.lobbyViewers}`)
  console.log(`  history browsers ....... ${p.historyBrowsers}`)
  console.log(`  total clients .......... ${clients}`)
  console.log(`  duration ............... ${p.durationSec}s`)
  console.log(`  hands/table ............ ${p.handsPerTable || '(run for duration)'}`)
  console.log(`  reconnect fraction ..... ${p.reconnectFraction}`)
  console.log(`  est. peak action RPS ... ~${est.peakRps}  (steady ~${est.steadyRps})`)
  console.log(`  est. realtime msgs/s ... ~${est.realtimeMsgsPerSec}  (postgres_changes fan-out)\n`)

  let ok = true
  try {
    assertWithinGuardrails(p)
    console.log('  ✔ within cost/scale guardrails')
  } catch (e) {
    ok = false
    console.log('  x GUARDRAIL FAIL:\n' + indent(String((e as Error).message)))
  }
  if (est.peakRps > GUARDRAILS.maxActionsPerSec) {
    console.log(`  ⚠ estimated peak RPS (${est.peakRps}) exceeds maxActionsPerSec (${GUARDRAILS.maxActionsPerSec}) — driver must throttle.`)
  }

  const target = resolveTarget()
  console.log(`\n  target supabase ........ ${redact(target.supabaseUrl)}`)
  console.log(`  target app ............. ${target.baseUrl}`)
  try {
    assertSafeTarget(target)
    console.log('  ✔ target is a sanctioned throwaway branch (or prod explicitly allowed)')
  } catch (e) {
    ok = false
    console.log('  ✗ TARGET SAFETY FAIL:\n' + indent(String((e as Error).message)))
  }

  console.log(`\n  stop switch armed ...... ${shouldStop() ? 'STOP FILE PRESENT (would abort)' : 'clear'}`)
  console.log(`\n${ok ? 'PREFLIGHT OK — a real run is permitted.' : 'PREFLIGHT BLOCKED — fix the failures above.'}\n`)
  process.exit(ok ? 0 : 1)
}

// Rough command-rate model: ~1 action per active seat per (avg think + ~120ms server RTT), plus
// street-advance/settlement transitions (~5 per hand) amortised over a hand. Directional only.
function estimateActionRate(p: ReturnType<typeof resolveProfile>) {
  const avgThink = (p.actionThinkMsMin + p.actionThinkMsMax) / 2 + 120
  const seated = p.tables * p.playersPerTable
  const steadyRps = Math.round((seated / (avgThink / 1000)) * 0.5) // ~half the seats are folded/idle at any moment
  const peakRps = Math.round(steadyRps * 2.2) // burst at street changes / simultaneous settlements
  // Each committed action fans out on poker_hands + poker_seats + poker_tables(×2 version bumps).
  const realtimeMsgsPerSec = Math.round(steadyRps * 4 * (p.playersPerTable + p.spectatorsPerTable))
  return { steadyRps, peakRps, realtimeMsgsPerSec }
}

function indent(s: string): string {
  return s.split('\n').map((l) => '      ' + l).join('\n')
}
function redact(url: string): string {
  return url ? url.replace(/https?:\/\//, '') : '(none)'
}

main()
