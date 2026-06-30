// Appends a concise, SECRET-FREE run summary to $GITHUB_STEP_SUMMARY (and stdout).
// Usage: node e2e/tlmn/ci-summary.mjs "<level label>" "<base url>"
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACT_DIR = path.join(__dirname, '.artifacts')
const level = process.argv[2] || 'TLMN E2E'
const baseUrl = process.argv[3] || process.env.TLMN_E2E_BASE_URL || '(local dev server)'

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const results = readJSON(path.join(ARTIFACT_DIR, 'results.json'))
const cleanup = readJSON(path.join(ARTIFACT_DIR, 'cleanup-report.json'))

const fullRan = process.env.TLMN_E2E_WRITE === '1' && process.env.TLMN_E2E_ALLOW_PROD === '1'
const lines = []
lines.push(`## ${level}`)
lines.push('')
lines.push(`- Environment: GitHub Actions (${process.env.RUNNER_OS || 'linux'}), Node ${process.version}`)
lines.push(`- Base URL: ${baseUrl}`)
lines.push(`- Commit: ${process.env.GITHUB_SHA || '(local)'}`)
lines.push(`- Run: ${process.env.GITHUB_RUN_ID || '(local)'} (attempt ${process.env.GITHUB_RUN_ATTEMPT || '1'})`)

if (results?.stats) {
  const s = results.stats
  const passed = (s.unexpected ?? 0) === 0
  lines.push(`- Scenarios: expected ${s.expected ?? 0}, unexpected ${s.unexpected ?? 0}, flaky ${s.flaky ?? 0}, skipped ${s.skipped ?? 0}`)
  lines.push(`- Browser result: ${passed ? '✅ passed' : '❌ failed'}`)
} else {
  lines.push('- Playwright results.json not found (no browser run, or it failed before reporting).')
}

lines.push(`- Full two-player write flow: ${fullRan ? '**ENABLED** (write flags set)' : 'not run (safe mode — no DB writes)'}`)
if (cleanup) lines.push(`- Cleanup: ${cleanup.ok ? '✅ ok' : '⚠️ review cleanup-report.json'} (${(cleanup.steps || []).length} steps, runTag ${cleanup.runTag || 'n/a'})`)
else if (fullRan) lines.push('- Cleanup: report not found ⚠️')

// Deployment safety verdict (heuristic, secret-free).
const safe = results?.stats ? (results.stats.unexpected ?? 0) === 0 : false
lines.push(`- Deployment safety verdict: ${safe ? '✅ no failing scenarios in this run' : '⚠️ failures present or no browser run — review artifacts'}`)
lines.push('')
lines.push(`Artifacts: Playwright HTML report, traces, videos, screenshots, results.json, junit.xml${fullRan ? ', cleanup-report.json' : ''}.`)

const text = lines.join('\n') + '\n'
if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text) } catch { /* ignore */ } }
console.log(text)
