// Standalone run-scoped cleanup — invoked by the workflow's always() step so it runs
// after pass, failure, OR cancellation. Restores/cleans only THIS run's data (see
// run-utils.mjs) and writes a cleanup report artifact. Never prints secrets.
//
// Plain ESM JS → runs on any Node:  node e2e/tlmn/teardown.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { teardownRun } from './run-utils.mjs'

const ARTIFACT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.artifacts')

let result
try {
  result = await teardownRun()
} catch (e) {
  result = { ok: false, runTag: 'unknown', steps: [`teardown threw: ${e.message}`] }
}
try {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'cleanup-report.json'), JSON.stringify(result, null, 2))
} catch { /* artifact dir may be unavailable; the log below still records it */ }

console.log(`[tlmn-teardown] ok=${result.ok} runTag=${result.runTag} steps=${result.steps.length}`)
for (const s of result.steps) console.log('  -', s)
if (!result.ok) console.log('::warning::TLMN teardown reported an issue — review cleanup-report.json')
