// i18n parity gate: every locale must define exactly the same set of keys.
// Usage: node scripts/check-i18n-parity.mjs   (exit 1 on mismatch)
import { readFileSync } from 'node:fs'

const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']

function flatten(obj, prefix = '', acc = {}) {
  for (const k of Object.keys(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, acc)
    else acc[key] = true
  }
  return acc
}

const sets = LOCALES.map((l) =>
  flatten(JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'))),
)
const base = Object.keys(sets[0])
let failed = false

LOCALES.forEach((loc, i) => {
  const missing = base.filter((k) => !sets[i][k])
  const extra = Object.keys(sets[i]).filter((k) => !sets[0][k])
  if (missing.length || extra.length) {
    failed = true
    console.error(`✗ ${loc}: missing=${missing.length} extra=${extra.length}`)
    if (missing.length) console.error(`   missing: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
    if (extra.length) console.error(`   extra:   ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ' …' : ''}`)
  }
})

if (failed) {
  console.error('\ni18n parity FAILED')
  process.exit(1)
}
console.log(`✓ i18n parity OK — ${base.length} keys × ${LOCALES.length} locales`)
