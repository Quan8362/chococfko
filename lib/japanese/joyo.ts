// Jōyō (常用漢字) school-grade classification, parallel to JLPT levels.
// Grades 1–6 = Kyōiku (elementary), 's' = remaining Jōyō (secondary, db value 7).

export const JOYO_KEYS = ['1', '2', '3', '4', '5', '6', 's'] as const
export type JoyoKey = (typeof JOYO_KEYS)[number]

/** Route + storage key, e.g. 'joyo-1', 'joyo-s'. */
export function joyoUrl(key: JoyoKey): string {
  return `joyo-${key}`
}

/** Parse a route param like 'joyo-1' / 'joyo-s' back to a JoyoKey, or null. */
export function parseJoyoParam(param: string): JoyoKey | null {
  if (!param.startsWith('joyo-')) return null
  const k = param.slice(5) as JoyoKey
  return JOYO_KEYS.includes(k) ? k : null
}

/** DB joyo_grade value: '1'..'6' -> 1..6, 's' -> 7. */
export function joyoDbValue(key: JoyoKey): number {
  return key === 's' ? 7 : parseInt(key, 10)
}
