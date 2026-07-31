// Resolve UI strings from the app's own vi.json so specs assert against stable message KEYS instead
// of hardcoded translated literals. If a label changes in the message file the specs follow it, and
// a typo'd key throws loudly instead of silently matching nothing.
import fs from 'node:fs'
import path from 'node:path'

const raw = fs.readFileSync(path.resolve(process.cwd(), 'messages', 'vi.json'), 'utf8')
const MESSAGES = JSON.parse(raw) as Record<string, unknown>

// Dotted-path lookup with {placeholder} interpolation, mirroring next-intl's ICU-lite subset.
export function t(key: string, vars?: Record<string, string | number>): string {
  const val = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, MESSAGES)
  if (typeof val !== 'string') throw new Error(`[tnmt-e2e] missing vi.json message key: ${key}`)
  if (!vars) return val
  return val.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}
